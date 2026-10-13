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

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.safebusalberta.app.MainActivity;
import com.safebusalberta.app.R;

import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

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
    private final ScheduledThreadPoolExecutor networkExecutor = new ScheduledThreadPoolExecutor(1);
    private LocationUploadPump uploadPump;
    private final TrackingHttpClient httpClient = new TrackingHttpClient();
    private volatile boolean destroyed;
    private static final String RETRY_NOT_BEFORE = "upload_retry_not_before";
    private long lastCapturedAt;
    private static final long LOCATION_PING_INTERVAL_MS = TrackingCadence.ACTIVE_TRIP_INTERVAL_MS;

    @Override
    public void onCreate() {
        super.onCreate();
        store = new TrackingCryptoStore(this);
        queue = new EncryptedLocationQueue(this, store);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        networkExecutor.setRemoveOnCancelPolicy(true);
        uploadPump = new LocationUploadPump(new LocationUploadPump.Backend() {
            @Override public long authorizationDeadlineMs() {
                TrackingConfig config = TrackingConfig.load(store);
                if (config == null || config.authorizedUntil > System.currentTimeMillis() + MAX_AUTHORIZATION_MS + 60_000L) return 0;
                return config.authorizedUntil;
            }
            @Override public boolean hasPending() { return queue.size() > 0; }
            @Override public boolean connected() { return isConnected(); }
            @Override public LocationUploadPump.Result uploadHead() throws Exception { return uploadQueuedHead(); }
            @Override public long retryNotBeforeMs() {
                try { return Math.max(0, Long.parseLong(store.get(RETRY_NOT_BEFORE))); }
                catch (NumberFormatException ignored) { return 0; }
            }
            @Override public void saveRetryNotBeforeMs(long value) throws Exception {
                if (value == 0) store.remove(RETRY_NOT_BEFORE);
                else store.put(RETRY_NOT_BEFORE, Long.toString(value));
            }
            @Override public void onIdle() {
                finishIfQueueEmpty("true".equals(store.get("finish_after_flush")));
            }
            @Override public void onExpired() { stopForExpiredAuthorization(); }
        }, (task, delay) -> {
            java.util.concurrent.ScheduledFuture<?> future = networkExecutor.schedule(task, delay, TimeUnit.MILLISECONDS);
            return () -> future.cancel(false);
        }, System::currentTimeMillis, bound -> ThreadLocalRandom.current().nextInt(bound));
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
            try {
                synchronized (TrackingConfig.class) {
                    TrackingConfig current = TrackingConfig.load(store);
                    if (current != null) current.withCollecting(false).save(store);
                    store.put("finish_after_flush", "true");
                }
            } catch (Exception ignored) {
                stopForExpiredAuthorization();
                return START_NOT_STICKY;
            }
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
        destroyed = true;
        uploadPump.close();
        stopLocationUpdates();
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onLocationChanged(Location location) {
        TrackingConfig config = TrackingConfig.load(store);
        long now = System.currentTimeMillis();
        if (config == null || config.authorizedUntil <= now) {
            stopForExpiredAuthorization();
            return;
        }
        // A late GPS callback after pause/end must not remove recovery authorization.
        if (!config.collecting) return;
        if (now - lastCapturedAt < LOCATION_PING_INTERVAL_MS) return;
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
            updateNotification(queue.size() == 0
                ? "Bus tracking active"
                : "Bus tracking active — " + queue.size() + " update(s) waiting");
            flushQueue();
        } catch (Exception exception) {
            stopLocationUpdates();
            try {
                synchronized (TrackingConfig.class) {
                    TrackingConfig current = TrackingConfig.load(store);
                    if (current != null && current.trackingToken.equals(config.trackingToken)) {
                        current.withCollecting(false).save(store);
                        store.put("finish_after_flush", "true");
                    }
                }
            } catch (Exception ignored) {}
            updateNotification("Tracking stopped — secure queue unavailable");
            flushQueue();
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
        locationManager.requestLocationUpdates(provider, LOCATION_PING_INTERVAL_MS, 0f, this);
    }

    private void stopLocationUpdates() {
        if (locationManager != null) locationManager.removeUpdates(this);
    }

    private void flushQueue() {
        if (!destroyed) uploadPump.wake();
    }

    private LocationUploadPump.Result uploadQueuedHead() throws Exception {
        EncryptedLocationQueue.Entry entry = queue.peek();
        if (entry == null) return LocationUploadPump.Result.progress();
        TrackingConfig config = TrackingConfig.load(store);
        if (!maySend(config)) return LocationUploadPump.Result.halted();
        TrackingHttpClient.Result result = postEvent(config, entry.payload);
        if (result.statusCode == 401) {
            if (!maySend(TrackingConfig.load(store))) return LocationUploadPump.Result.halted();
            if (!isCurrentAuthorization(config)) return LocationUploadPump.Result.retry(0);
            TrackingHttpClient.Result refresh = request(
                config.supabaseUrl + "/auth/v1/token?grant_type=refresh_token",
                config.anonKey, null, new JSONObject().put("refresh_token", config.refreshToken).toString()
            );
            if (UploadHttpPolicy.retryable(refresh.statusCode)) return LocationUploadPump.Result.retry(refresh.retryAfterMs);
            if (refresh.statusCode < 200 || refresh.statusCode >= 300) {
                return haltUploadsIfCurrent(config, "Authentication expired — reopen BusSafe");
            }
            JSONObject body = new JSONObject(refresh.body);
            // Preserve a concurrent pause/end and do not overwrite a replacement trip's configuration.
            synchronized (TrackingConfig.class) {
                TrackingConfig current = TrackingConfig.load(store);
                if (!maySend(current)) return LocationUploadPump.Result.halted();
                if (!current.trackingToken.equals(config.trackingToken)
                    || !current.refreshToken.equals(config.refreshToken)) return LocationUploadPump.Result.retry(0);
                config = current.withTokens(body.getString("access_token"), body.optString("refresh_token", current.refreshToken));
                config.save(store);
            }
            // A refreshed ingestion is a separate, paced attempt; never issue a second event POST here.
            return LocationUploadPump.Result.retry(0);
        }
        if (UploadHttpPolicy.retryable(result.statusCode)) return LocationUploadPump.Result.retry(result.retryAfterMs);
        if (result.statusCode < 200 || result.statusCode >= 300) {
            return haltUploadsIfCurrent(config, "Tracking authorization was rejected");
        }
        JSONObject response = new JSONObject(result.body);
        boolean accepted = response.optBoolean("accepted", false);
        String reason = response.optString("rejectionReason", "");
        boolean discardable = accepted || reason.equals("stale_fix")
            || reason.equals("invalid_fix") || reason.equals("impossible_jump")
            || reason.equals("out_of_order") || response.optBoolean("stopTracking", false);
        if (!discardable) return LocationUploadPump.Result.retry(0);
        queue.remove(entry.sequence);
        if (accepted) {
            String recordedAt = response.optString("recordedAt", null);
            if (recordedAt != null) store.put("last_accepted_at", recordedAt);
        }
        synchronized (TrackingConfig.class) {
            TrackingConfig current = TrackingConfig.load(store);
            if (current != null && current.trackingToken.equals(config.trackingToken)
                && response.optBoolean("stopTracking", false)) {
                if ("paused".equals(response.optString("tripState"))) pauseFromServer();
                else stopFromServer("Trip is no longer active — tracking stopped");
            }
        }
        return LocationUploadPump.Result.progress();
    }

    private boolean maySend(TrackingConfig config) {
        if (destroyed) return false;
        if (config == null || config.authorizedUntil <= System.currentTimeMillis()
            || config.authorizedUntil > System.currentTimeMillis() + MAX_AUTHORIZATION_MS + 60_000L) {
            stopForExpiredAuthorization();
            return false;
        }
        return true;
    }

    private boolean isCurrentAuthorization(TrackingConfig sent) {
        TrackingConfig current = TrackingConfig.load(store);
        return current != null && current.trackingToken.equals(sent.trackingToken)
            && current.refreshToken.equals(sent.refreshToken);
    }

    private LocationUploadPump.Result haltUploadsIfCurrent(TrackingConfig sent, String message) {
        synchronized (TrackingConfig.class) {
            if (!isCurrentAuthorization(sent)) return LocationUploadPump.Result.retry(0);
            stopFromServer(message);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return LocationUploadPump.Result.halted();
        }
    }

    private TrackingHttpClient.Result postEvent(TrackingConfig config, JSONObject payload) throws Exception {
        return request(
            config.supabaseUrl + "/rest/v1/rpc/ingest_driver_location_event",
            config.anonKey, config.accessToken, payload.toString()
        );
    }

    private TrackingHttpClient.Result request(String urlValue, String anonKey, String bearer, String body) throws Exception {
        return httpClient.request(urlValue, anonKey, bearer, body);
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
        synchronized (TrackingConfig.class) {
            if (queue.size() != 0) return;
            TrackingConfig config = TrackingConfig.load(store);
            // A newly resumed/replaced trip takes precedence over an old completion flag.
            if (config != null && config.collecting) return;
            if (removeConfiguration) {
                store.remove(TrackingConfig.STORE_KEY);
                store.remove("finish_after_flush");
            }
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
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

    private void createNotificationChannel() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Active bus tracking", NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Persistent indicator shown only while BusSafe is collecting or recovering trip locations.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String content) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_safebus)
            .setContentTitle("BusSafe trip tracking")
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

}
