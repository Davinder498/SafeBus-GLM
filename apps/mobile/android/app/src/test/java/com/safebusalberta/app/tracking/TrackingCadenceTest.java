package com.safebusalberta.app.tracking;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TrackingCadenceTest {
    @Test
    public void movingConnectedBusUsesFiveSecondCadence() {
        assertEquals(5_000L, TrackingCadence.intervalMs(12f, true, 80, false, 3_000L));
    }

    @Test
    public void stationaryAndOfflineStatesReduceCollectionRate() {
        assertEquals(30_000L, TrackingCadence.intervalMs(0f, false, 80, false, 3_000L));
    }

    @Test
    public void lowBatteryAndPowerSaverTakePriority() {
        assertEquals(60_000L, TrackingCadence.intervalMs(10f, true, 20, false, 3_000L));
        assertEquals(120_000L, TrackingCadence.intervalMs(10f, true, 10, true, 3_000L));
        assertEquals(90_000L, TrackingCadence.intervalMs(10f, true, 80, true, 3_000L));
    }

    @Test
    public void serverCanRequestSlowerCadence() {
        assertEquals(45_000L, TrackingCadence.intervalMs(10f, true, 80, false, 45_000L));
    }
}
