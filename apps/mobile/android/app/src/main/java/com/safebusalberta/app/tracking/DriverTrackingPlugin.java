package com.safebusalberta.app.tracking;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

@CapacitorPlugin(
    name = "DriverTracking",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION
        }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class DriverTrackingPlugin extends Plugin {
    @PluginMethod
    public void requestTrackingPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAliases(new String[]{"location", "notifications"}, call, "permissionsCallback");
        } else {
            requestPermissionForAlias("location", call, "permissionsCallback");
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        getDeviceInfo(call);
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        try {
            TrackingCryptoStore store = new TrackingCryptoStore(getContext());
            JSObject result = new JSObject();
            result.put("installationId", store.getOrCreateInstallationId());
            result.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            result.put("appVersion", getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName);
            result.put("locationPermission", permissionState());
            result.put("notificationPermission", notificationPermissionState());
            result.put("pushConfigured", pushConfigured());
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Could not initialize the protected device identity.", exception);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName())
        );
        launchSettings(call, intent);
    }

    @PluginMethod
    public void openLocationServices(PluginCall call) {
        launchSettings(call, new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!"always".equals(permissionState())) {
            call.reject(
                "Precise background location permission is required before tracking can start.",
                "LOCATION_PERMISSION_REQUIRED"
            );
            return;
        }
        if ("denied".equals(notificationPermissionState())) {
            call.reject(
                "Notification permission is required so active trip tracking remains visible.",
                "NOTIFICATION_PERMISSION_REQUIRED"
            );
            return;
        }
        String[] required = {
            "supabaseUrl", "anonKey", "accessToken", "refreshToken",
            "trackingToken", "deviceCredential"
        };
        for (String key : required) {
            if (call.getString(key) == null || call.getString(key).isBlank()) {
                call.reject("Missing native tracking configuration: " + key);
                return;
            }
        }
        try {
            if (!TrackingQueueRecovery.approvedEndpoint(call.getString("supabaseUrl"))) {
                call.reject("This tracking queue requires the approved SafeBus server.");
                return;
            }
            long authorizedUntil = call.getLong("authorizedUntil", System.currentTimeMillis() + 18 * 60 * 60 * 1000L);
            if (authorizedUntil <= System.currentTimeMillis()) {
                call.reject("The trip tracking authorization has expired.", "TRACKING_AUTHORIZATION_EXPIRED");
                return;
            }
            TrackingCryptoStore store = new TrackingCryptoStore(getContext());
            TrackingConfig config = new TrackingConfig(
                call.getString("supabaseUrl"), call.getString("anonKey"),
                call.getString("accessToken"), call.getString("refreshToken"),
                call.getString("trackingToken"), call.getString("deviceCredential"),
                authorizedUntil, true
            );
            synchronized (TrackingConfig.class) {
                config.save(store);
                TrackingStatusStore.begin(store, config);
            }
            Intent intent = new Intent(getContext(), DriverTrackingService.class)
                .setAction(DriverTrackingService.ACTION_START_OR_RESUME);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve(statusObject(store, call.getString("profileId")));
        } catch (Exception exception) {
            call.reject("Native bus tracking could not be started.", exception);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        updateCollection(call, false, DriverTrackingService.ACTION_PAUSE);
    }

    @PluginMethod
    public void resume(PluginCall call) {
        updateCollection(call, true, DriverTrackingService.ACTION_START_OR_RESUME);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        updateCollection(call, false, DriverTrackingService.ACTION_STOP_COLLECTION);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(statusObject(new TrackingCryptoStore(getContext()), call.getString("profileId")));
        } catch (Exception exception) {
            call.reject("Could not read native tracking status.", exception);
        }
    }

    private void updateCollection(PluginCall call, boolean collecting, String action) {
        try {
            TrackingCryptoStore store = new TrackingCryptoStore(getContext());
            synchronized (TrackingConfig.class) {
                TrackingConfig config = TrackingConfig.load(store);
                if (config == null) {
                    call.resolve(statusObject(store, call.getString("profileId")));
                    return;
                }
                if (collecting && (config.profileId() == null || !config.profileId().equals(call.getString("profileId")))) {
                    call.reject("Reopen the active bus before resuming tracking.");
                    return;
                }
                config.withCollecting(collecting).save(store);
                if (collecting) TrackingStatusStore.begin(store, config);
                if (DriverTrackingService.ACTION_STOP_COLLECTION.equals(action)) {
                    store.put("finish_after_flush", "true");
                } else if (collecting) {
                    store.remove("finish_after_flush");
                }
            }
            Intent intent = new Intent(getContext(), DriverTrackingService.class).setAction(action);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve(statusObject(store, call.getString("profileId")));
        } catch (Exception exception) {
            call.reject("Could not change native tracking state.", exception);
        }
    }

    private void launchSettings(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Android settings could not be opened.", exception);
        }
    }

    private JSObject statusObject(TrackingCryptoStore store, String profileId) throws Exception {
        synchronized (TrackingConfig.class) {
            TrackingConfig config = TrackingConfig.load(store);
            JSONObject metadata = TrackingStatusStore.read(store);
            JSObject result = new JSObject();
            result.put("statusVersion", 2);
            result.put("configured", false);
            result.put("collecting", false);
            result.put("queuedEvents", 0);
            ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
            NetworkCapabilities network = manager.getNetworkCapabilities(manager.getActiveNetwork());
            result.put("connected", network != null && network.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            boolean ownConfig = profileId != null && config != null && profileId.equals(config.profileId());
            boolean ownIssue = profileId != null && config == null && profileId.equals(metadata.optString("owner"))
                && metadata.has("issue");
            if (!ownConfig && !ownIssue) return result;
            try (EncryptedLocationQueue queue = new EncryptedLocationQueue(getContext(), store)) {
                Boolean pending = queue.pendingForSession(ownConfig ? config.trackingToken : metadata.optString("session"));
                // Exact non-empty counts are intentionally unavailable in v2: obtaining
                // them would decrypt the entire FIFO every ten seconds.
                result.put("queuedEvents", Boolean.FALSE.equals(pending) ? 0 : JSONObject.NULL);
                if (pending != null) result.put("pendingDelivery", pending);
                else result.put("issue", "delivery_status_unavailable");
            } catch (Exception ignored) {
                // A presentation read must not turn a successful start/pause into
                // an apparent failure or change the collector/upload pump.
                result.put("queuedEvents", JSONObject.NULL);
                result.put("issue", "delivery_status_unavailable");
            }
            if (ownConfig) {
                long now = System.currentTimeMillis();
                boolean authorized = config.authorizedUntil > now && config.authorizedUntil <= now + 18 * 60 * 60 * 1000L + 60_000L;
                result.put("configured", true);
                result.put("collecting", config.collecting && authorized);
                if (TrackingStatusStore.belongsTo(metadata, config)) {
                    if (metadata.has("lastAcceptedAt")) result.put("lastAcceptedAt", metadata.optString("lastAcceptedAt"));
                    if (metadata.has("issue")) result.put("issue", metadata.optString("issue"));
                }
                if (!authorized) result.put("issue", "authorization_expired");
                else if (config.collecting && !"always".equals(permissionState())) result.put("issue", "location_permission");
            } else result.put("issue", metadata.optString("issue"));
            return result;
        }
    }

    private String permissionState() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return "denied";
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return "foreground_only";
        if (!Settings.Secure.isLocationProviderEnabled(
            getContext().getContentResolver(), android.location.LocationManager.GPS_PROVIDER)) return "disabled";
        return "always";
    }

    private String notificationPermissionState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "not_required";
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
    }

    private boolean pushConfigured() {
        int resourceId = getContext().getResources().getIdentifier(
            "google_app_id",
            "string",
            getContext().getPackageName()
        );
        if (resourceId == 0) return false;
        String applicationId = getContext().getString(resourceId);
        return applicationId != null && !applicationId.isBlank();
    }
}
