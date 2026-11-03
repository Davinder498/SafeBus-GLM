package com.safebusalberta.app.tracking;

import org.junit.Test;
import java.util.ArrayDeque;
import static org.junit.Assert.*;

public final class TrackingQueueRecoveryTest {
    private static final String ENDPOINT = "https://ckrkfylsyihwouvesypm.supabase.co";

    @Test public void rotationAndRescanRequireCoordinateFreeOwnershipProof() {
        TrackingQueueRecovery cache = new TrackingQueueRecovery();
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-1", "current"));
        cache.remember(ENDPOINT, "driver-a", "current", "credential-1", "current");
        assertTrue(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-1", "current"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-2", "current"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "replacement", "credential-2", "current"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "replacement", "credential-2", "replacement"));
    }

    @Test public void cachedProofCannotSurviveAccountOriginSessionOrCredentialReplacement() {
        TrackingQueueRecovery cache = new TrackingQueueRecovery();
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-2", "old"));
        cache.remember(ENDPOINT, "driver-a", "current", "credential-2", "old");
        assertTrue(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-2", "old"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-b", "current", "credential-2", "old"));
        assertFalse(cache.hasProof("https://other.invalid", "driver-a", "current", "credential-2", "old"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "replacement", "credential-2", "old"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-3", "old"));
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-2", "different-old"));
        cache.invalidate();
        assertFalse(cache.hasProof(ENDPOINT, "driver-a", "current", "credential-2", "old"));
    }

    @Test public void unknownOwnerCannotCacheProof() {
        TrackingQueueRecovery cache = new TrackingQueueRecovery();
        cache.remember(ENDPOINT, null, "current", "credential", "old");
        assertFalse(cache.hasProof(ENDPOINT, null, "current", "credential", "old"));
    }

    @Test public void rejectedBacklogIsRetiredInBoundedBatchesWithoutTouchingTheNextSession() throws Exception {
        ArrayDeque<String> rows = new ArrayDeque<>();
        for (int i = 0; i < 130; i++) rows.add("revoked");
        rows.add("current");
        rows.add("revoked");
        TrackingQueueRecovery.RejectedQueue queue = new TrackingQueueRecovery.RejectedQueue() {
            @Override public String headSession() { return rows.peek(); }
            @Override public void removeHead() { rows.remove(); }
        };
        assertEquals(64, TrackingQueueRecovery.retireDeniedHead(queue, "revoked"));
        assertEquals(64, TrackingQueueRecovery.retireDeniedHead(queue, "revoked"));
        assertEquals(2, TrackingQueueRecovery.retireDeniedHead(queue, "revoked"));
        assertEquals(0, TrackingQueueRecovery.retireDeniedHead(queue, "revoked"));
        assertEquals("current", rows.peek());
        assertEquals(2, rows.size());
    }

    @Test public void aDenialCannotCarryIntoAnotherDriversOrDevicesAuthorization() {
        TrackingQueueRecovery cache = new TrackingQueueRecovery();
        cache.deny(ENDPOINT, "driver-a", "active", "credential", "revoked");
        assertTrue(cache.hasDenial(ENDPOINT, "driver-a", "active", "credential", "revoked"));
        assertFalse(cache.hasDenial(ENDPOINT, "driver-b", "active", "credential", "revoked"));
        assertFalse(cache.hasDenial(ENDPOINT, "driver-a", "active", "replacement", "revoked"));
        assertFalse(cache.hasDenial(ENDPOINT, "driver-a", "new-session", "credential", "revoked"));
        assertFalse(cache.hasDenial(ENDPOINT, "driver-a", "active", "credential", "different"));
        cache.invalidate();
        assertFalse(cache.hasDenial(ENDPOINT, "driver-a", "active", "credential", "revoked"));
    }

    @Test public void retiredDenialsAreLocalToTheirEventButCurrentAndTransientFailuresAreNotDiscarded() {
        assertTrue(TrackingQueueRecovery.rejectedOldEvent(403, "current", "old"));
        assertTrue(TrackingQueueRecovery.rejectedOldEvent(400, "current", "old"));
        for (int code : new int[]{401, 404, 408, 429, 500, 503})
            assertFalse(TrackingQueueRecovery.rejectedOldEvent(code, "current", "old"));
        assertFalse(TrackingQueueRecovery.rejectedOldEvent(403, "current", "current"));
        assertFalse(TrackingQueueRecovery.rejectedOldEvent(400, "current", "current"));
    }

    @Test public void oldStopRepliesCannotStopOrAcknowledgeTheNewCollector() {
        assertFalse(TrackingStatusScope.acceptsAcknowledgement("driver-a", "new", "driver-a", "new", "old"));
        assertFalse(TrackingStatusScope.acceptsAcknowledgement("driver-b", "new", "driver-a", "new", "new"));
        assertTrue(TrackingStatusScope.acceptsAcknowledgement("driver-a", "new", "driver-a", "new", "new"));
    }

    @Test public void aDifferentServerCannotAuthorizeExportOfTheEncryptedQueue() {
        assertTrue(TrackingQueueRecovery.approvedEndpoint(ENDPOINT));
        assertTrue(TrackingQueueRecovery.approvedEndpoint(ENDPOINT + ":443/"));
        for (String url : new String[]{null, "http://ckrkfylsyihwouvesypm.supabase.co", "https://other.supabase.co",
            ENDPOINT + ".evil.invalid", "https://attacker.invalid@ckrkfylsyihwouvesypm.supabase.co", ENDPOINT + "/other",
            ENDPOINT + "?target=other", ENDPOINT + "#other", ENDPOINT + ":8443", "http://127.0.0.1"})
            assertFalse(TrackingQueueRecovery.approvedEndpoint(url));
    }
}
