package com.safebusalberta.app.tracking;

import org.json.JSONObject;
import java.time.Instant;

/** Presentation metadata only. Failure must never change FIFO/collector behavior. */
final class TrackingStatusStore {
    private static final String KEY = "tracking_delivery_status_v2";

    static JSONObject read(TrackingCryptoStore store) {
        try { return new JSONObject(store.get(KEY)); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    static boolean belongsTo(JSONObject state, TrackingConfig config) {
        return config != null && TrackingStatusScope.matches(config.profileId(), config.trackingToken,
            state.optString("owner"), state.optString("session"));
    }

    static void begin(TrackingCryptoStore store, TrackingConfig config) {
        synchronized (TrackingConfig.class) {
            try {
                JSONObject state = read(store);
                if (!belongsTo(state, config)) state = identity(config);
                state.remove("issue");
                store.put(KEY, state.toString());
            } catch (Exception ignored) { /* Unknown status is safer than invented delivery. */ }
        }
    }

    static void accepted(TrackingCryptoStore store, TrackingConfig sent, String eventSession, String recordedAt) {
        synchronized (TrackingConfig.class) {
            try {
                TrackingConfig current = TrackingConfig.load(store);
                // Older FIFO entries and late replies must not acknowledge a replacement trip.
                if (current == null || !TrackingStatusScope.acceptsAcknowledgement(current.profileId(),
                    current.trackingToken, sent.profileId(), sent.trackingToken, eventSession)) return;
                Instant.parse(recordedAt);
                JSONObject state = read(store);
                if (!belongsTo(state, current)) state = identity(current);
                state.put("lastAcceptedAt", recordedAt);
                store.put(KEY, state.toString());
            } catch (Exception ignored) { /* The accepted event has already advanced safely. */ }
        }
    }

    static void issue(TrackingCryptoStore store, TrackingConfig config, String issue) {
        synchronized (TrackingConfig.class) {
            try {
                if (config == null) return;
                TrackingConfig current = TrackingConfig.load(store);
                if (current == null || !current.trackingToken.equals(config.trackingToken)) return;
                JSONObject state = read(store);
                if (!belongsTo(state, current)) state = identity(current);
                state.put("issue", issue);
                store.put(KEY, state.toString());
            } catch (Exception ignored) { /* Retain existing collection/authorization behavior. */ }
        }
    }

    private static JSONObject identity(TrackingConfig config) throws Exception {
        if (config.profileId() == null) throw new IllegalStateException("Tracking owner unavailable");
        return new JSONObject().put("owner", config.profileId()).put("session", config.trackingToken);
    }
}
