package com.safebusalberta.app.tracking;

/** Active-trip GPS collection cadence shared by the service and local unit tests. */
public final class TrackingCadence {
    public static final long ACTIVE_TRIP_INTERVAL_MS = 3_000L;

    private TrackingCadence() {}

    public static long intervalMs() {
        return ACTIVE_TRIP_INTERVAL_MS;
    }
}
