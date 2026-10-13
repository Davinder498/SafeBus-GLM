package com.safebusalberta.app.tracking;

import static org.junit.Assert.*;

import java.time.Instant;
import org.junit.Test;

public class UploadHttpPolicyTest {
    @Test public void temporaryFailuresAreDistinctFromAuthorizationDenial() {
        for (int status : new int[]{408, 429, 500, 502, 503, 504}) assertTrue(UploadHttpPolicy.retryable(status));
        for (int status : new int[]{200, 301, 400, 401, 403, 404, 422}) assertFalse(UploadHttpPolicy.retryable(status));
    }

    @Test public void retryAfterSecondsAreNotCappedAtClientBackoff() {
        assertEquals(600_000, UploadHttpPolicy.retryAfterMs(" 600 ", 100_000));
        assertEquals(0, UploadHttpPolicy.retryAfterMs("0", 100_000));
    }

    @Test public void retryAfterHttpDateUsesRemainingTime() {
        long now = Instant.parse("2026-10-12T12:00:00Z").toEpochMilli();
        assertEquals(60_000, UploadHttpPolicy.retryAfterMs("Mon, 12 Oct 2026 12:01:00 GMT", now));
        assertEquals(0, UploadHttpPolicy.retryAfterMs("Mon, 12 Oct 2026 11:59:00 GMT", now));
    }

    @Test public void malformedHeadersUseClientBackoff() {
        for (String value : new String[]{null, "", "-1", "1.5", "tomorrow", "NaN", "2 seconds", "x".repeat(129)}) {
            assertEquals(0, UploadHttpPolicy.retryAfterMs(value, 100_000));
        }
    }

    @Test public void numericOverflowCannotCauseAnImmediateRetry() {
        assertEquals(Long.MAX_VALUE, UploadHttpPolicy.retryAfterMs("99999999999999999999999999", 100_000));
        assertEquals(Long.MAX_VALUE, UploadHttpPolicy.retryAfterMs(Long.toString(Long.MAX_VALUE), 100_000));
    }
}
