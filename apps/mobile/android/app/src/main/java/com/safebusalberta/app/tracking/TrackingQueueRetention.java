package com.safebusalberta.app.tracking;

/** Routine encrypted queue expiry. No coordinates, ownership or clock reset in this policy. */
final class TrackingQueueRetention {
    static final long MAX_AGE_MILLIS = 30L * 24 * 60 * 60 * 1000;
    static final int BATCH_LIMIT = 64;
    static boolean expired(long recordedAt, long receivedAt, long now) {
        if (recordedAt <= 0 || receivedAt <= 0 || now < recordedAt || now < receivedAt) return false;
        return now - Math.max(recordedAt, receivedAt) > MAX_AGE_MILLIS;
    }
}
