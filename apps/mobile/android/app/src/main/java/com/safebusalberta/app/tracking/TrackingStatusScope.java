package com.safebusalberta.app.tracking;

/** Local presentation scope only; the server remains responsible for authorization. */
final class TrackingStatusScope {
    static boolean matches(String owner, String session, String savedOwner, String savedSession) {
        return owner != null && !owner.isBlank() && session != null && !session.isBlank()
            && owner.equals(savedOwner) && session.equals(savedSession);
    }

    static boolean acceptsAcknowledgement(String owner, String session, String sentOwner,
        String sentSession, String eventSession) {
        return matches(owner, session, sentOwner, sentSession) && session.equals(eventSession);
    }
}
