package com.safebusalberta.app.tracking;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Bounded transport for native ingestion and token refresh; never logs request secrets. */
final class TrackingHttpClient {
    static final class Result {
        final int statusCode;
        final String body;
        final long retryAfterMs;
        Result(int statusCode, String body, long retryAfterMs) {
            this.statusCode = statusCode;
            this.body = body;
            this.retryAfterMs = retryAfterMs;
        }
    }

    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    TrackingHttpClient() { this(15_000, 20_000); }
    TrackingHttpClient(int connectTimeoutMs, int readTimeoutMs) {
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    Result request(String urlValue, String anonKey, String bearer, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(connectTimeoutMs);
            connection.setReadTimeout(readTimeoutMs);
            connection.setDoOutput(true);
            byte[] encodedBody = body.getBytes(StandardCharsets.UTF_8);
            // Streaming prevents HttpURLConnection from replaying a buffered POST implicitly.
            connection.setFixedLengthStreamingMode(encodedBody.length);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", anonKey);
            if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(encodedBody);
            }
            int status = connection.getResponseCode();
            long retryAfter = UploadHttpPolicy.retryAfterMs(connection.getHeaderField("Retry-After"), System.currentTimeMillis());
            // Retry headers survive empty/broken error bodies; never allocate an unbounded response.
            if (UploadHttpPolicy.retryable(status)) return new Result(status, "", retryAfter);
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            StringBuilder response = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    char[] buffer = new char[2_048];
                    int count;
                    while ((count = reader.read(buffer)) != -1) {
                        if (response.length() + count > 65_536) throw new java.io.IOException("Tracking response exceeds limit");
                        response.append(buffer, 0, count);
                    }
                }
            }
            return new Result(status, response.toString(), retryAfter);
        } finally {
            connection.disconnect();
        }
    }
}
