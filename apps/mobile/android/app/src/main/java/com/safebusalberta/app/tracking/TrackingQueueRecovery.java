package com.safebusalberta.app.tracking;

import java.net.URI;
import java.util.Arrays;

/** Coordinate-free ownership proof, scoped to one current authorization. */
final class TrackingQueueRecovery {
    private String[] authorized;
    private String[] denied;
    static final int RETIRE_BATCH_LIMIT = 64;

    interface RejectedQueue {
        String headSession() throws Exception;
        void removeHead() throws Exception;
    }

    static int retireDeniedHead(RejectedQueue queue, String deniedSession) throws Exception {
        int removed = 0;
        while (removed < RETIRE_BATCH_LIMIT && deniedSession.equals(queue.headSession())) {
            queue.removeHead();
            removed++;
        }
        return removed;
    }

    static boolean approvedEndpoint(String url) {
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                && "ckrkfylsyihwouvesypm.supabase.co".equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && (uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
        } catch (Exception ignored) { return false; }
    }

    boolean hasProof(String endpoint, String owner, String activeSession, String credential, String eventSession) {
        return owner != null && Arrays.equals(authorized,
            new String[]{endpoint, owner, activeSession, credential, eventSession});
    }

    void remember(String endpoint, String owner, String activeSession, String credential, String eventSession) {
        authorized = owner == null ? null : new String[]{endpoint, owner, activeSession, credential, eventSession};
    }

    boolean hasDenial(String endpoint, String owner, String activeSession, String credential, String eventSession) {
        return owner != null && Arrays.equals(denied,
            new String[]{endpoint, owner, activeSession, credential, eventSession});
    }

    void deny(String endpoint, String owner, String activeSession, String credential, String eventSession) {
        denied = owner == null ? null : new String[]{endpoint, owner, activeSession, credential, eventSession};
    }

    void invalidate() { authorized = null; denied = null; }

    static boolean rejectedOldEvent(int statusCode, String activeSession, String eventSession) {
        return !activeSession.equals(eventSession) && (statusCode == 400 || statusCode == 403);
    }
}
