package com.safebusalberta.app.tracking;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Local-only fingerprint for bounded latest-state GPS recovery; no token disclosure. */
final class TrackingQueueCompaction {
    static final int FIXES_PER_SESSION = 3;

    private TrackingQueueCompaction() {}

    static String sessionTag(String trackingToken) throws NoSuchAlgorithmException {
        if (trackingToken == null ||
            !trackingToken.matches("^sbus_track_v1_[A-Za-z0-9_-]{40,80}$")) return null;

        byte[] digest = MessageDigest.getInstance("SHA-256")
            .digest(trackingToken.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            int unsigned = value & 0xff;
            hex.append(Character.forDigit(unsigned >>> 4, 16));
            hex.append(Character.forDigit(unsigned & 0x0f, 16));
        }
        return hex.toString();
    }
}
