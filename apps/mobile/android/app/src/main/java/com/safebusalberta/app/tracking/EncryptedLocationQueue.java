package com.safebusalberta.app.tracking;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

import java.time.Instant;

/** Durable FIFO whose sensitive payload column is AES-GCM encrypted at rest. */
final class EncryptedLocationQueue extends SQLiteOpenHelper {
    static final class Entry {
        final long sequence;
        final String eventId;
        final JSONObject payload;

        Entry(long sequence, String eventId, JSONObject payload) {
            this.sequence = sequence;
            this.eventId = eventId;
            this.payload = payload;
        }
    }

    // Match the server's recorded-at admission window. Collection authorization
    // expires separately and can be renewed to deliver a still-valid backlog.
    private static final long DELIVERY_WINDOW_MS = 24 * 60 * 60 * 1000L;
    private static final int CLEANUP_BATCH = 200;
    private static final long UNKNOWN_RECORDED_AT = Long.MAX_VALUE;
    private final TrackingCryptoStore crypto;

    EncryptedLocationQueue(Context context, TrackingCryptoStore crypto) {
        super(context, "safebus_tracking_queue.db", null, 2);
        this.crypto = crypto;
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE queued_locations (" +
            "sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, payload_ciphertext TEXT NOT NULL, recorded_at_ms INTEGER)");
        db.execSQL("CREATE INDEX queued_location_age ON queued_locations(recorded_at_ms)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion == 1 && newVersion == 2) {
            db.execSQL("ALTER TABLE queued_locations ADD COLUMN recorded_at_ms INTEGER");
            db.execSQL("CREATE INDEX queued_location_age ON queued_locations(recorded_at_ms)");
            return;
        }
        throw new IllegalStateException("Tracking queue migration is required");
    }

    synchronized long nextSequence() throws Exception {
        long databaseNext;
        try (Cursor cursor = getReadableDatabase().rawQuery(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM queued_locations", null)) {
            cursor.moveToFirst();
            databaseNext = cursor.getLong(0);
        }
        String stored = crypto.get("next_device_sequence");
        long next = stored == null ? databaseNext : Math.max(databaseNext, Long.parseLong(stored));
        // Commit the next value before returning. A crash can create a safe gap,
        // but can never reuse a server-visible device sequence.
        crypto.put("next_device_sequence", Long.toString(next + 1));
        return next;
    }

    synchronized void enqueue(long sequence, String eventId, JSONObject payload) throws Exception {
        ContentValues values = new ContentValues();
        values.put("sequence", sequence);
        values.put("event_id", eventId);
        values.put("recorded_at_ms", Instant.parse(payload.getString("p_recorded_at")).toEpochMilli());
        values.put("payload_ciphertext", crypto.encrypt(payload.toString()));
        getWritableDatabase().insertOrThrow("queued_locations", null, values);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.execSQL("PRAGMA secure_delete=ON");
    }

    synchronized int pruneExpired(long now) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            int migrated = 0;
            try (Cursor cursor = db.rawQuery("SELECT sequence,payload_ciphertext FROM queued_locations "
                + "WHERE recorded_at_ms IS NULL ORDER BY sequence LIMIT " + CLEANUP_BATCH, null)) {
                while (cursor.moveToNext()) {
                    long recordedAt;
                    try {
                        JSONObject payload = new JSONObject(crypto.decrypt(cursor.getString(1)));
                        recordedAt = Instant.parse(payload.getString("p_recorded_at")).toEpochMilli();
                    } catch (Exception unreadable) {
                        // Preserve unreadable legacy ciphertext without blocking expiry of other rows.
                        recordedAt = UNKNOWN_RECORDED_AT;
                    }
                    ContentValues age = new ContentValues();
                    age.put("recorded_at_ms", recordedAt);
                    db.update("queued_locations", age, "sequence=?", new String[]{Long.toString(cursor.getLong(0))});
                    migrated++;
                }
            }
            int removed = db.delete("queued_locations",
                "sequence IN (SELECT sequence FROM queued_locations WHERE recorded_at_ms <= ? LIMIT " + CLEANUP_BATCH + ")",
                new String[]{Long.toString(now - DELIVERY_WINDOW_MS)});
            db.setTransactionSuccessful();
            return Math.max(migrated, removed);
        } finally {
            db.endTransaction();
        }
    }

    static boolean expired(JSONObject payload, long now) throws Exception {
        return Instant.parse(payload.getString("p_recorded_at")).toEpochMilli() <= now - DELIVERY_WINDOW_MS;
    }

    static void pruneOnWake(Context context) {
        try (EncryptedLocationQueue queue = new EncryptedLocationQueue(context, new TrackingCryptoStore(context))) {
            for (int batch = 0; batch < 20; batch++) {
                if (queue.pruneExpired(System.currentTimeMillis()) < CLEANUP_BATCH) break;
            }
        } catch (Exception ignored) {
            // Retry cleanup the next time the app wakes.
        }
    }

    synchronized Entry peek() throws Exception {
        try (Cursor cursor = getReadableDatabase().query(
            "queued_locations",
            new String[]{"sequence", "event_id", "payload_ciphertext"},
            null, null, null, null, "sequence ASC", "1")) {
            if (!cursor.moveToFirst()) return null;
            return new Entry(
                cursor.getLong(0),
                cursor.getString(1),
                new JSONObject(crypto.decrypt(cursor.getString(2)))
            );
        }
    }

    synchronized void remove(long sequence) {
        getWritableDatabase().delete("queued_locations", "sequence = ?",
            new String[]{Long.toString(sequence)});
    }

    /** Only the explicitly denied session at the FIFO head, in bounded batches. */
    synchronized int retireDeniedSession(String session) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            int removed = TrackingQueueRecovery.retireDeniedHead(new TrackingQueueRecovery.RejectedQueue() {
                private Entry head;
                @Override public String headSession() throws Exception {
                    head = peek();
                    return head == null ? null : head.payload.optString("p_tracking_token");
                }
                @Override public void removeHead() { remove(head.sequence); }
            }, session);
            db.setTransactionSuccessful();
            return removed;
        } finally { db.endTransaction(); }
    }

    synchronized int size() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM queued_locations", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    /** One encrypted row only: status polling must not scan a rural backlog. */
    synchronized Boolean pendingForSession(String trackingToken) throws Exception {
        try (Cursor cursor = getReadableDatabase().query("queued_locations",
            new String[]{"payload_ciphertext"}, null, null, null, null, "sequence DESC", "1")) {
            if (!cursor.moveToFirst()) return false;
            JSONObject payload = new JSONObject(crypto.decrypt(cursor.getString(0)));
            // A matching tail proves pending delivery. A different tail cannot prove
            // that this session has no older rows, so report unknown rather than scan.
            return trackingToken.equals(payload.optString("p_tracking_token")) ? true : null;
        }
    }
}
