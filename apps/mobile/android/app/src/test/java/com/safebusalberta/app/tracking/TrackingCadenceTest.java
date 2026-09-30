package com.safebusalberta.app.tracking;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TrackingCadenceTest {
    @Test
    public void activeTripUsesThreeSecondCadence() {
        assertEquals(3_000L, TrackingCadence.intervalMs());
        assertEquals(3_000L, TrackingCadence.ACTIVE_TRIP_INTERVAL_MS);
    }
}
