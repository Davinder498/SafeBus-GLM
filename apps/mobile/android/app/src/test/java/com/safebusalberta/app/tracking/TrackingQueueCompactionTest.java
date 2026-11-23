package com.safebusalberta.app.tracking;

import org.junit.Test;
import static org.junit.Assert.*;

public final class TrackingQueueCompactionTest {
    private static final String SESSION_A =
        "sbus_track_v1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private static final String SESSION_B =
        "sbus_track_v1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

    @Test public void opaqueSessionTagsStayStableButSeparateUnrelatedTrips() throws Exception {
        String a = TrackingQueueCompaction.sessionTag(SESSION_A);
        String b = TrackingQueueCompaction.sessionTag(SESSION_B);
        assertNotNull(a);
        assertEquals(64, a.length());
        assertEquals(a, TrackingQueueCompaction.sessionTag(SESSION_A));
        assertNotEquals(a, b);
        assertFalse(a.contains("sbus_track"));
        assertTrue(a.matches("[0-9a-f]{64}"));
    }

    @Test public void invalidAndLegacySessionsCannotBeCompacted() throws Exception {
        assertNull(TrackingQueueCompaction.sessionTag(null));
        assertNull(TrackingQueueCompaction.sessionTag(""));
        assertNull(TrackingQueueCompaction.sessionTag("invalid-session"));
        assertNull(TrackingQueueCompaction.sessionTag("sbus_track_v1_short"));
        assertEquals(3, TrackingQueueCompaction.FIXES_PER_SESSION);
    }
}
