package com.safebusalberta.app.tracking;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

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

    private final TrackingCryptoStore crypto;

    EncryptedLocationQueue(Context context, TrackingCryptoStore crypto) {
        super(context, "safebus_tracking_queue.db", null, 1);
        this.crypto = crypto;
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE queued_locations (" +
            "sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, payload_ciphertext TEXT NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
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
        values.put("payload_ciphertext", crypto.encrypt(payload.toString()));
        getWritableDatabase().insertOrThrow("queued_locations", null, values);
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

    synchronized int size() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM queued_locations", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
