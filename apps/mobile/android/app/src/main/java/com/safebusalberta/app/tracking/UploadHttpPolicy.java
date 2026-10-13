package com.safebusalberta.app.tracking;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/** Transport policy shared by ingestion and token refresh. */
final class UploadHttpPolicy {
    private UploadHttpPolicy() {}

    static boolean retryable(int status) {
        return status == 408 || status == 429 || status >= 500;
    }

    static long retryAfterMs(String value, long nowMs) {
        if (value == null || value.length() > 128) return 0;
        String trimmed = value.trim();
        if (trimmed.matches("[0-9]+")) {
            try {
                long seconds = Long.parseLong(trimmed);
                return seconds > Long.MAX_VALUE / 1_000 ? Long.MAX_VALUE : seconds * 1_000;
            } catch (NumberFormatException overflow) {
                return Long.MAX_VALUE;
            }
        }
        try {
            long deadline = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME)
                .toInstant().toEpochMilli();
            return Math.max(0, deadline - nowMs);
        } catch (DateTimeParseException | ArithmeticException ignored) {
            return 0;
        }
    }
}
