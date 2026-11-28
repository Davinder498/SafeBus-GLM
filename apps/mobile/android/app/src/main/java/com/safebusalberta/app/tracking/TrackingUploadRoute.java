package com.safebusalberta.app.tracking;

import com.safebusalberta.app.BuildConfig;
import java.net.URI;

enum TrackingUploadRoute {
    RPC("rpc", "ckrkfylsyihwouvesypm.supabase.co",
        "https://ckrkfylsyihwouvesypm.supabase.co/rest/v1/rpc/ingest_driver_location_event"),
    RECOVERY_BATCH("recovery-batch", "deladookciebwvqojhkv.supabase.co",
        "https://localhost:8443/tracking/v2/location"),
    BUSSAFE_BATCH("bussafe-batch", "ckrkfylsyihwouvesypm.supabase.co",
        "https://safebus.kids/tracking/v2/location");

    static final TrackingUploadRoute CURRENT = select(BuildConfig.GPS_ROUTE);
    private final String name;
    private final String authHost;
    private final String uploadUrl;

    TrackingUploadRoute(String name, String authHost, String uploadUrl) {
        this.name = name;
        this.authHost = authHost;
        this.uploadUrl = uploadUrl;
    }

    static TrackingUploadRoute select(String name) {
        for (TrackingUploadRoute route : values()) {
            if (route.name.equals(name)) return route;
        }
        throw new IllegalArgumentException("Unknown tracking upload route");
    }

    boolean accepts(String authUrl) {
        if (authUrl == null) return false;
        try {
            URI uri = URI.create(authUrl);
            return "https".equalsIgnoreCase(uri.getScheme()) && authHost.equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && ("".equals(uri.getRawPath()) || "/".equals(uri.getRawPath()))
                && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    String locationUrl(String authUrl) {
        if (!accepts(authUrl)) throw new IllegalArgumentException("Unexpected tracking project");
        return uploadUrl;
    }
}
