package com.safebusalberta.app.tracking;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Real loopback HTTP only; all keys/tokens/bodies are synthetic. */
public class TrackingHttpClientTest {
    private LoopbackServer server;
    private String origin;

    @Before public void start() throws IOException {
        server = new LoopbackServer();
        origin = "http://127.0.0.1:" + server.getAddress().getPort();
        server.start();
    }

    @After public void stop() { server.stop(0); }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Test public void postsUtf8JsonWithOnlyExpectedSyntheticHeaders() throws Exception {
        AtomicReference<String> method = new AtomicReference<>();
        AtomicReference<String> payload = new AtomicReference<>();
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<String> bearer = new AtomicReference<>();
        server.createContext("/event", exchange -> {
            method.set(exchange.getRequestMethod());
            payload.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            key.set(exchange.getRequestHeaders().getFirst("apikey"));
            bearer.set(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, 200, "{\"accepted\":true}");
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(
            origin + "/event", "synthetic-anon", "synthetic-token", "{\"event\":\"é\"}"
        );
        assertEquals(200, result.statusCode);
        assertEquals("{\"accepted\":true}", result.body);
        assertEquals("POST", method.get());
        assertEquals("{\"event\":\"é\"}", payload.get());
        assertEquals("synthetic-anon", key.get());
        assertEquals("Bearer synthetic-token", bearer.get());
    }

    @Test public void empty429BodyPreservesServerWait() throws Exception {
        server.createContext("/event", exchange -> {
            exchange.getResponseHeaders().add("Retry-After", "600");
            respond(exchange, 429, "");
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(origin + "/event", "synthetic", null, "{}");
        assertEquals(429, result.statusCode);
        assertEquals(600_000, result.retryAfterMs);
        assertEquals("", result.body);
    }

    @Test public void broken503BodyDoesNotHideRetryHeaders() throws Exception {
        server.createContext("/event", exchange -> {
            exchange.getResponseHeaders().add("Retry-After", "10");
            exchange.sendResponseHeaders(503, 100);
            exchange.getResponseBody().write('x');
            exchange.close();
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(origin + "/event", "synthetic", null, "{}");
        assertEquals(503, result.statusCode);
        assertEquals(10_000, result.retryAfterMs);
    }

    @Test public void refreshRequestOmitsBearerAndReturnsPermanentDenial() throws Exception {
        AtomicReference<String> bearer = new AtomicReference<>("unset");
        server.createContext("/refresh", exchange -> {
            bearer.set(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, 400, "{\"error\":\"synthetic revoked token\"}");
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(origin + "/refresh", "synthetic", null, "{}");
        assertNull(bearer.get());
        assertEquals(400, result.statusCode);
        assertFalse(UploadHttpPolicy.retryable(result.statusCode));
    }

    @Test public void unauthorizedIngestionIsReturnedWithoutImplicitPostReplay() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        server.createContext("/event", exchange -> {
            requests.incrementAndGet();
            respond(exchange, 401, "{\"error\":\"synthetic expired session\"}");
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(origin + "/event", "synthetic", "synthetic", "{}");
        assertEquals(401, result.statusCode);
        assertEquals(1, requests.get());
    }

    @Test public void redirectsAreReturnedWithoutForwardingCredentials() throws Exception {
        AtomicInteger redirected = new AtomicInteger();
        server.createContext("/event", exchange -> {
            exchange.getResponseHeaders().add("Location", origin + "/redirect-target");
            respond(exchange, 307, "");
        });
        server.createContext("/redirect-target", exchange -> {
            redirected.incrementAndGet();
            respond(exchange, 200, "{}");
        });
        TrackingHttpClient.Result result = new TrackingHttpClient().request(origin + "/event", "synthetic", "synthetic", "{}");
        assertEquals(307, result.statusCode);
        assertEquals(0, redirected.get());
    }

    @Test public void oversizedSuccessIsNotAnAcknowledgment() throws Exception {
        server.createContext("/event", exchange -> respond(exchange, 200, "x".repeat(65_537)));
        IOException failure = assertThrows(IOException.class, () ->
            new TrackingHttpClient().request(origin + "/event", "synthetic", null, "{}"));
        assertEquals("Tracking response exceeds limit", failure.getMessage());
    }

    @Test public void stalledResponseTimesOut() throws Exception {
        server.createContext("/event", exchange -> {
            try { Thread.sleep(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            try { respond(exchange, 200, "{}"); } catch (IOException ignored) { exchange.close(); }
        });
        assertThrows(SocketTimeoutException.class, () ->
            new TrackingHttpClient(100, 100).request(origin + "/event", "synthetic", null, "{}"));
    }

    // Uses only java.net APIs available to Android's unit-test compiler. One loopback
    // listener/worker, bounded synthetic bodies, Connection: close and deterministic teardown.
    interface Handler { void handle(HttpExchange exchange) throws IOException; }
    static final class LoopbackServer {
        final ServerSocket listener;
        final Map<String, Handler> handlers = new ConcurrentHashMap<>();
        volatile boolean stopped;
        volatile Socket active;
        Thread worker;
        LoopbackServer() throws IOException {
            listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
        }
        InetSocketAddress getAddress() { return (InetSocketAddress) listener.getLocalSocketAddress(); }
        void createContext(String path, Handler handler) { handlers.put(path, handler); }
        void start() {
            worker = new Thread(() -> {
                while (!stopped) {
                    try (Socket client = listener.accept()) {
                        active = client;
                        client.setSoTimeout(2_000);
                        HttpExchange exchange = new HttpExchange(client);
                        Handler handler = handlers.get(exchange.path);
                        if (handler == null) respond(exchange, 404, "");
                        else handler.handle(exchange);
                    } catch (IOException ignored) {
                        // Client disconnect/truncated-body faults are deliberate fixture cases.
                    } finally { active = null; }
                }
            }, "synthetic-tracking-http");
            worker.setDaemon(true);
            worker.start();
        }
        void stop(int ignored) {
            stopped = true;
            try { listener.close(); } catch (IOException ignoredClose) {}
            Socket client = active;
            if (client != null) try { client.close(); } catch (IOException ignoredClose) {}
            worker.interrupt();
            try { worker.join(3_000); } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                fail("fixture teardown interrupted");
            }
            assertFalse("loopback fixture worker must terminate", worker.isAlive());
        }
    }
    static final class Headers extends HashMap<String, String> {
        void add(String name, String value) { put(name.toLowerCase(Locale.ROOT), value); }
        String getFirst(String name) { return get(name.toLowerCase(Locale.ROOT)); }
    }
    static final class HttpExchange {
        final Socket socket;
        final String method;
        final String path;
        final Headers requestHeaders = new Headers();
        final Headers responseHeaders = new Headers();
        final byte[] body;
        HttpExchange(Socket socket) throws IOException {
            this.socket = socket;
            InputStream input = socket.getInputStream();
            String[] request = line(input).split(" ");
            if (request.length != 3) throw new IOException("invalid synthetic HTTP request");
            method = request[0];
            path = request[1];
            String header;
            int headerCount = 0;
            while (!(header = line(input)).isEmpty()) {
                if (++headerCount > 32) throw new IOException("fixture header limit");
                int colon = header.indexOf(':');
                if (colon < 0) throw new IOException("invalid synthetic header");
                requestHeaders.add(header.substring(0, colon), header.substring(colon + 1).trim());
            }
            int length = Integer.parseInt(requestHeaders.getOrDefault("content-length", "0"));
            if (length < 0 || length > 4_096) throw new IOException("fixture body limit");
            body = input.readNBytes(length);
            if (body.length != length) throw new IOException("truncated synthetic request");
        }
        static String line(InputStream input) throws IOException {
            ByteArrayOutputStream line = new ByteArrayOutputStream();
            int value;
            while ((value = input.read()) != -1) {
                if (value == '\n') return line.toString(StandardCharsets.US_ASCII).replace("\r", "");
                if (line.size() >= 8_192) throw new IOException("fixture line limit");
                line.write(value);
            }
            throw new IOException("truncated synthetic HTTP line");
        }
        String getRequestMethod() { return method; }
        InputStream getRequestBody() { return new ByteArrayInputStream(body); }
        Headers getRequestHeaders() { return requestHeaders; }
        Headers getResponseHeaders() { return responseHeaders; }
        OutputStream getResponseBody() throws IOException { return socket.getOutputStream(); }
        void sendResponseHeaders(int status, long length) throws IOException {
            StringBuilder headers = new StringBuilder("HTTP/1.1 " + status + " Synthetic\r\n");
            headers.append("Connection: close\r\nContent-Length: ").append(Math.max(0, length)).append("\r\n");
            responseHeaders.forEach((name, value) -> headers.append(name).append(": ").append(value).append("\r\n"));
            headers.append("\r\n");
            socket.getOutputStream().write(headers.toString().getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().flush();
        }
        void close() { try { socket.close(); } catch (IOException ignored) {} }
    }
}
