package com.safebusalberta.app.tracking;

import org.json.JSONObject;

final class TrackingConfig {
    static final String STORE_KEY = "active_tracking_config";

    final String supabaseUrl;
    final String anonKey;
    final String accessToken;
    final String refreshToken;
    final String trackingToken;
    final String deviceCredential;
    final long authorizedUntil;
    final boolean collecting;

    TrackingConfig(
        String supabaseUrl,
        String anonKey,
        String accessToken,
        String refreshToken,
        String trackingToken,
        String deviceCredential,
        long authorizedUntil,
        boolean collecting
    ) {
        this.supabaseUrl = supabaseUrl;
        this.anonKey = anonKey;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.trackingToken = trackingToken;
        this.deviceCredential = deviceCredential;
        this.authorizedUntil = authorizedUntil;
        this.collecting = collecting;
    }

    static TrackingConfig load(TrackingCryptoStore store) {
        String raw = store.get(STORE_KEY);
        if (raw == null) return null;
        try {
            JSONObject value = new JSONObject(raw);
            return new TrackingConfig(
                value.getString("supabaseUrl"), value.getString("anonKey"),
                value.getString("accessToken"), value.getString("refreshToken"),
                value.getString("trackingToken"), value.getString("deviceCredential"),
                value.getLong("authorizedUntil"), value.optBoolean("collecting", true)
            );
        } catch (Exception ignored) {
            store.remove(STORE_KEY);
            return null;
        }
    }

    void save(TrackingCryptoStore store) throws Exception {
        JSONObject value = new JSONObject();
        value.put("supabaseUrl", supabaseUrl);
        value.put("anonKey", anonKey);
        value.put("accessToken", accessToken);
        value.put("refreshToken", refreshToken);
        value.put("trackingToken", trackingToken);
        value.put("deviceCredential", deviceCredential);
        value.put("authorizedUntil", authorizedUntil);
        value.put("collecting", collecting);
        store.put(STORE_KEY, value.toString());
    }

    TrackingConfig withTokens(String nextAccessToken, String nextRefreshToken) {
        return new TrackingConfig(supabaseUrl, anonKey, nextAccessToken, nextRefreshToken,
            trackingToken, deviceCredential, authorizedUntil, collecting);
    }

    TrackingConfig withCollecting(boolean nextCollecting) {
        return new TrackingConfig(supabaseUrl, anonKey, accessToken, refreshToken,
            trackingToken, deviceCredential, authorizedUntil, nextCollecting);
    }
}
