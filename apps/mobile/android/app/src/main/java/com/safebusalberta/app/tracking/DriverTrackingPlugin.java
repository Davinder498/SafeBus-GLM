package com.safebusalberta.app.tracking;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
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
            config.save(store);
            Intent intent = new Intent(getContext(), DriverTrackingService.class)
                .setAction(DriverTrackingService.ACTION_START_OR_RESUME);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve(statusObject(store));
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
            call.resolve(statusObject(new TrackingCryptoStore(getContext())));
        } catch (Exception exception) {
            call.reject("Could not read native tracking status.", exception);
        }
    }

    private void updateCollection(PluginCall call, boolean collecting, String action) {
        try {
            TrackingCryptoStore store = new TrackingCryptoStore(getContext());
            TrackingConfig config = TrackingConfig.load(store);
            if (config == null) {
                call.resolve(statusObject(store));
                return;
            }
            config.withCollecting(collecting).save(store);
            if (DriverTrackingService.ACTION_STOP_COLLECTION.equals(action)) {
                store.put("finish_after_flush", "true");
            } else if (collecting) {
                store.remove("finish_after_flush");
            }
            Intent intent = new Intent(getContext(), DriverTrackingService.class).setAction(action);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve(statusObject(store));
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

    private JSObject statusObject(TrackingCryptoStore store) {
        TrackingConfig config = TrackingConfig.load(store);
        EncryptedLocationQueue queue = new EncryptedLocationQueue(getContext(), store);
        JSObject result = new JSObject();
        result.put("configured", config != null);
        result.put("collecting", config != null && config.collecting
            && config.authorizedUntil > System.currentTimeMillis());
        result.put("queuedEvents", queue.size());
        String acceptedAt = store.get("last_accepted_at");
        if (acceptedAt != null) result.put("lastAcceptedAt", acceptedAt);
        return result;
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
}
