package com.safebusalberta.app.tracking;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/** Restarts only a still-authorized service; never creates a new tracking authorization. */
public final class TrackingBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        TrackingCryptoStore store = new TrackingCryptoStore(context);
        TrackingConfig config = TrackingConfig.load(store);
        if (config == null || config.authorizedUntil <= System.currentTimeMillis()) return;
        if (!config.collecting && new EncryptedLocationQueue(context, store).size() == 0) return;
        Intent service = new Intent(context, DriverTrackingService.class)
            .setAction(DriverTrackingService.ACTION_START_OR_RESUME);
        ContextCompat.startForegroundService(context, service);
    }
}
