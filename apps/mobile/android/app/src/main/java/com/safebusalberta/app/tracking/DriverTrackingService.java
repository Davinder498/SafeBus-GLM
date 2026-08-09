package com.safebusalberta.app.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.safebusalberta.app.MainActivity;
import com.safebusalberta.app.R;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native foreground location collector. Collection is authorized only by an
 * encrypted active-trip configuration and always has a persistent OS notice.
 */
public final class DriverTrackingService extends Service implements LocationListener {
    public static final String ACTION_START_OR_RESUME = "com.safebusalberta.tracking.START_OR_RESUME";
    public static final String ACTION_PAUSE = "com.safebusalberta.tracking.PAUSE";
    public static final String ACTION_STOP_COLLECTION = "com.safebusalberta.tracking.STOP_COLLECTION";

    private static final String CHANNEL_ID = "safebus_active_trip_tracking";
    private static final int NOTIFICATION_ID = 7107;
    private static final long MAX_AUTHORIZATION_MS = 18 * 60 * 60 * 1000L;

    private TrackingCryptoStore store;
    private EncryptedLocationQueue queue;
    private LocationManager locationManager;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean flushing = new AtomicBoolean(false);
    private long lastCapturedAt;
    private long requestedIntervalMs = 5_000L;
    private long serverMinimumMs = 3_000L;

    @Override
    public void onCreate() {
        super.onCreate();
        store = new TrackingCryptoStore(this);
        queue = new EncryptedLocationQueue(this, store);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START_OR_RESUME : intent.getAction();
        startForeground(NOTIFICATION_ID, buildNotification("Starting secure bus tracking…"));

        TrackingConfig config = TrackingConfig.load(store);
        if (config == null || config.authorizedUntil <= System.currentTimeMillis()
            || config.authorizedUntil > System.currentTimeMillis() + MAX_AUTHORIZATION_MS + 60_000L) {
            stopForExpiredAuthorization();
            return START_NOT_STICKY;
        }

        if (ACTION_STOP_COLLECTION.equals(action)) {
            stopLocationUpdates();
            updateNotification("Trip ended — securely sending queued locations");
            flushQueue();
            finishIfQueueEmpty(true);
            return START_REDELIVER_INTENT;
        }
        if (ACTION_PAUSE.equals(action) || !config.collecting) {
            stopLocationUpdates();
            updateNotification("Trip paused — location collection is off");
            flushQueue();
            finishIfQueueEmpty(false);
            return START_REDELIVER_INTENT;
        }

        store.remove("finish_after_flush");
        updateNotification("Bus tracking active");
        startLocationUpdates();
        flushQueue();
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onLocationChanged(Location location) {
        TrackingConfig config = TrackingConfig.load(store);
        long now = System.currentTimeMillis();
        if (config == null || !config.collecting || config.authorizedUntil <= now) {
            stopForExpiredAuthorization();
            return;
        }
        if (now - lastCapturedAt < requestedIntervalMs) return;
        if (!location.hasAccuracy() || location.getAccuracy() > 250f
            || Math.abs(now - location.getTime()) > 120_000L) return;

        try {
            long sequence = queue.nextSequence();
            String eventId = UUID.randomUUID().toString();
            JSONObject payload = new JSONObject();
            payload.put("p_tracking_token", config.trackingToken);
            payload.put("p_device_credential", config.deviceCredential);
            payload.put("p_event_id", eventId);
            payload.put("p_sequence", sequence);
            payload.put("p_recorded_at", Instant.ofEpochMilli(location.getTime()).toString());
            payload.put("p_latitude", location.getLatitude());
            payload.put("p_longitude", location.getLongitude());
            payload.put("p_accuracy_m", location.getAccuracy());
            payload.put("p_heading_deg", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            payload.put("p_speed_mps", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            payload.put("p_battery_percent", batteryPercent());
            payload.put("p_connectivity", connectivityLabel());
            queue.enqueue(sequence, eventId, payload);
            lastCapturedAt = now;
            requestedIntervalMs = TrackingCadence.intervalMs(
                location.hasSpeed() ? location.getSpeed() : 0f,
                isConnected(), batteryPercent(), isPowerSaveMode(), serverMinimumMs
            );
            restartLocationUpdatesAtCadence();
            updateNotification(queue.size() == 0
                ? "Bus tracking active"
                : "Bus tracking active — " + queue.size() + " update(s) waiting");
            flushQueue();
        } catch (Exception exception) {
            stopLocationUpdates();
            try {
                config.withCollecting(false).save(store);
                store.put("finish_after_flush", "true");
            } catch (Exception ignored) {}
            updateNotification("Tracking stopped — secure queue unavailable");
        }
    }

    @Override
    public void onProviderDisabled(String provider) {
        updateNotification("Bus tracking active — waiting for GPS");
    }

    @SuppressWarnings("MissingPermission")
    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            stopLocationUpdates();
            updateNotification("Tracking stopped — precise location permission is required");
            return;
        }
        restartLocationUpdatesAtCadence();
    }

    @SuppressWarnings("MissingPermission")
    private void restartLocationUpdatesAtCadence() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return;
        locationManager.removeUpdates(this);
        String provider = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
        locationManager.requestLocationUpdates(provider, requestedIntervalMs, 5f, this);
    }

    private void stopLocationUpdates() {
        if (locationManager != null) locationManager.removeUpdates(this);
    }

    private void flushQueue() {
        if (!isConnected() || !flushing.compareAndSet(false, true)) return;
        networkExecutor.execute(() -> {
            try {
                while (isConnected()) {
                    EncryptedLocationQueue.Entry entry = queue.peek();
                    if (entry == null) break;
                    TrackingConfig config = TrackingConfig.load(store);
                    if (config == null) break;
                    HttpResult result = postEvent(config, entry.payload);
                    if (result.statusCode == 401) {
                        TrackingConfig refreshed = refreshSession(config);
                        if (refreshed == null) {
                            stopFromServer("Authentication expired — reopen SafeBus");
                            break;
                        }
                        config = refreshed;
                        result = postEvent(config, entry.payload);
                    }
                    if (result.statusCode >= 500 || result.statusCode == 429) break;
                    if (result.statusCode < 200 || result.statusCode >= 300) {
                        stopFromServer("Tracking authorization was rejected");
                        break;
                    }
                    JSONObject response = new JSONObject(result.body);
                    boolean accepted = response.optBoolean("accepted", false);
                    String reason = response.optString("rejectionReason", "");
                    boolean discardable = accepted || reason.equals("stale_fix")
                        || reason.equals("invalid_fix") || reason.equals("impossible_jump")
                        || reason.equals("out_of_order") || response.optBoolean("stopTracking", false);
                    if (!discardable) break;
                    queue.remove(entry.sequence);
                    if (accepted) {
                        String recordedAt = response.optString("recordedAt", null);
                        if (recordedAt != null) store.put("last_accepted_at", recordedAt);
                        serverMinimumMs = Math.max(3_000L, response.optLong("nextPingInMs", 3_000L));
                    }
                    if (response.optBoolean("stopTracking", false)) {
                        if ("paused".equals(response.optString("tripState"))) {
                            pauseFromServer();
                        } else {
                            stopFromServer("Trip is no longer active — tracking stopped");
                        }
                    }
                }
            } catch (Exception ignored) {
                // The encrypted FIFO remains intact and retries on the next fix/restart.
            } finally {
                flushing.set(false);
                boolean finishing = "true".equals(store.get("finish_after_flush"));
                finishIfQueueEmpty(finishing);
                if (queue.size() > 0 && !isConnected()) {
                    updateNotification("Bus location saved securely — waiting for network");
                }
            }
        });
    }

    private HttpResult postEvent(TrackingConfig config, JSONObject payload) throws Exception {
        return request(
            config.supabaseUrl + "/rest/v1/rpc/ingest_driver_location_event",
            config.anonKey, config.accessToken, payload.toString()
        );
    }

    private TrackingConfig refreshSession(TrackingConfig config) {
        try {
            JSONObject requestBody = new JSONObject().put("refresh_token", config.refreshToken);
            HttpResult response = request(
                config.supabaseUrl + "/auth/v1/token?grant_type=refresh_token",
                config.anonKey, null, requestBody.toString()
            );
            if (response.statusCode < 200 || response.statusCode >= 300) return null;
            JSONObject body = new JSONObject(response.body);
            TrackingConfig refreshed = config.withTokens(
                body.getString("access_token"), body.optString("refresh_token", config.refreshToken)
            );
            refreshed.save(store);
            return refreshed;
        } catch (Exception ignored) {
            return null;
        }
    }

    private HttpResult request(String urlValue, String anonKey, String bearer, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(20_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("apikey", anonKey);
        if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        StringBuilder response = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
        }
        connection.disconnect();
        return new HttpResult(status, response.toString());
    }

    private void stopFromServer(String message) {
        try {
            TrackingConfig config = TrackingConfig.load(store);
            if (config != null) config.withCollecting(false).save(store);
            store.put("finish_after_flush", "true");
        } catch (Exception ignored) {}
        stopLocationUpdates();
        updateNotification(message);
    }

    private void pauseFromServer() {
        try {
            TrackingConfig config = TrackingConfig.load(store);
            if (config != null) config.withCollecting(false).save(store);
            store.remove("finish_after_flush");
        } catch (Exception ignored) {}
        stopLocationUpdates();
        updateNotification("Trip paused — location collection is off");
    }

    private void stopForExpiredAuthorization() {
        stopLocationUpdates();
        store.remove(TrackingConfig.STORE_KEY);
        store.remove("finish_after_flush");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void finishIfQueueEmpty(boolean removeConfiguration) {
        if (queue.size() != 0) return;
        TrackingConfig config = TrackingConfig.load(store);
        if (!removeConfiguration && config != null && config.collecting) return;
        if (removeConfiguration) {
            store.remove(TrackingConfig.STORE_KEY);
            store.remove("finish_after_flush");
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private boolean isConnected() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private String connectivityLabel() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        if (capabilities == null) return "offline";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ? "unknown" : "offline";
    }

    private int batteryPercent() {
        Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) return 100;
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return 100;
        return Math.round(level * 100f / scale);
    }

    private boolean isPowerSaveMode() {
        return ((PowerManager) getSystemService(Context.POWER_SERVICE)).isPowerSaveMode();
    }

    private void createNotificationChannel() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Active bus tracking", NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Persistent indicator shown only while SafeBus is collecting or recovering trip locations.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String content) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("SafeBus trip tracking")
            .setContentText(content)
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private void updateNotification(String content) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification(content));
    }

    private static final class HttpResult {
        final int statusCode;
        final String body;
        HttpResult(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }
    }
}
