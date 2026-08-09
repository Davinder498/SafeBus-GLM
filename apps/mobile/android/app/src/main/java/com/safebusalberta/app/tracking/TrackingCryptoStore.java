package com.safebusalberta.app.tracking;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypts every tracking secret and queued payload with an Android Keystore key. */
final class TrackingCryptoStore {
    private static final String KEY_ALIAS = "safebus_driver_tracking_v1";
    private static final String PREFS = "safebus_tracking_secure";
    private static final String INSTALLATION_ID = "installation_id";

    private final SharedPreferences preferences;

    TrackingCryptoStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    synchronized String get(String key) {
        String encrypted = preferences.getString(key, null);
        if (encrypted == null) return null;
        try {
            return decrypt(encrypted);
        } catch (Exception exception) {
            preferences.edit().remove(key).apply();
            return null;
        }
    }

    synchronized void put(String key, String value) throws Exception {
        preferences.edit().putString(key, encrypt(value)).commit();
    }

    synchronized void remove(String key) {
        preferences.edit().remove(key).commit();
    }

    synchronized String getOrCreateInstallationId() throws Exception {
        String existing = get(INSTALLATION_ID);
        if (existing != null) return existing;
        String created = UUID.randomUUID().toString();
        put(INSTALLATION_ID, created);
        return created;
    }

    String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        byte[] envelope = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, envelope, 0, iv.length);
        System.arraycopy(ciphertext, 0, envelope, iv.length, ciphertext.length);
        return Base64.encodeToString(envelope, Base64.NO_WRAP);
    }

    String decrypt(String envelopeValue) throws Exception {
        byte[] envelope = Base64.decode(envelopeValue, Base64.NO_WRAP);
        if (envelope.length < 29) throw new IllegalArgumentException("Invalid encrypted value");
        byte[] iv = new byte[12];
        byte[] ciphertext = new byte[envelope.length - iv.length];
        System.arraycopy(envelope, 0, iv, 0, iv.length);
        System.arraycopy(envelope, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
}
