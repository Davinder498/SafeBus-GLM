package com.safebusalberta.app.tracking;

import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingStatusScopeTest {
    @Test public void currentTripAcknowledgementCanEstablishDelivery() {
        assertTrue(TrackingStatusScope.acceptsAcknowledgement("driver-a", "trip-a", "driver-a", "trip-a", "trip-a"));
    }
    @Test public void olderQueuedTripCannotAcknowledgeReplacementTrip() {
        // The current uploader can drain old FIFO entries using its current credentials.
        assertFalse(TrackingStatusScope.acceptsAcknowledgement("driver-a", "trip-b", "driver-a", "trip-b", "trip-a"));
    }
    @Test public void lateReplyFromReplacedConfigurationCannotEstablishDelivery() {
        assertFalse(TrackingStatusScope.acceptsAcknowledgement("driver-a", "trip-b", "driver-a", "trip-a", "trip-a"));
    }
    @Test public void anotherDriverCannotSeeOrAcknowledgeSavedStatus() {
        assertFalse(TrackingStatusScope.matches("driver-b", "trip-a", "driver-a", "trip-a"));
        assertFalse(TrackingStatusScope.acceptsAcknowledgement("driver-b", "trip-a", "driver-a", "trip-a", "trip-a"));
    }
    @Test public void missingOrUnscopedLegacyMetadataCannotEstablishDelivery() {
        assertFalse(TrackingStatusScope.matches(null, "trip-a", null, "trip-a"));
        assertFalse(TrackingStatusScope.matches("driver-a", "", "driver-a", ""));
        assertFalse(TrackingStatusScope.matches("driver-a", "trip-a", null, null));
    }
}
