package com.safebusalberta.app.tracking;

/** Pure cadence policy shared by the service and local unit tests. */
public final class TrackingCadence {
    private TrackingCadence() {}

    public static long intervalMs(
        float speedMps,
        boolean connected,
        int batteryPercent,
        boolean powerSaveMode,
        long serverMinimumMs
    ) {
        long interval = speedMps >= 2.0f ? 5_000L : 30_000L;
        if (!connected) interval = Math.max(interval, 30_000L);
        if (batteryPercent <= 10) interval = Math.max(interval, 120_000L);
        else if (batteryPercent <= 20) interval = Math.max(interval, 60_000L);
        if (powerSaveMode) interval = Math.max(interval, 90_000L);
        return Math.max(interval, Math.max(3_000L, serverMinimumMs));
    }
}
