package com.safebusalberta.app.tracking;

import java.util.function.IntUnaryOperator;
import java.util.function.LongSupplier;

/** Single-flight FIFO recovery, independent of GPS callbacks. No Android or HTTP dependencies. */
final class LocationUploadPump implements AutoCloseable {
    interface Cancellation { void cancel(); }
    interface Scheduler { Cancellation schedule(Runnable task, long delayMs); }
    interface Backend {
        long authorizationDeadlineMs();
        boolean hasPending();
        boolean connected();
        Result uploadHead() throws Exception;
        long retryNotBeforeMs();
        void saveRetryNotBeforeMs(long value) throws Exception;
        void onIdle();
        void onExpired();
    }

    static final class Result {
        enum Kind { PROGRESS, RETRY, HALTED }
        final Kind kind;
        final long retryAfterMs;
        private Result(Kind kind, long retryAfterMs) {
            this.kind = kind;
            this.retryAfterMs = Math.max(0, retryAfterMs);
        }
        static Result progress() { return new Result(Kind.PROGRESS, 0); }
        static Result retry(long retryAfterMs) { return new Result(Kind.RETRY, retryAfterMs); }
        static Result halted() { return new Result(Kind.HALTED, 0); }
    }

    private final Backend backend;
    private final Scheduler scheduler;
    private final LongSupplier clock;
    private final IntUnaryOperator random;
    private Cancellation pending;
    private boolean running;
    private boolean closed;
    private boolean idleTimer;
    private boolean wakeRequested;
    private int failures;
    private long notBefore;
    private long generation;

    LocationUploadPump(Backend backend, Scheduler scheduler, LongSupplier clock, IntUnaryOperator random) {
        this.backend = backend;
        this.scheduler = scheduler;
        this.clock = clock;
        this.random = random;
        notBefore = Math.max(backend.retryNotBeforeMs(), add(clock.getAsLong(), random.applyAsInt(3_001)));
    }

    /** New fixes/resume cannot bypass an existing pace or retry deadline. */
    synchronized void wake() {
        if (closed) return;
        if (running) {
            wakeRequested = true;
            return;
        }
        if (pending != null) {
            if (!idleTimer) return;
            pending.cancel();
            pending = null;
        }
        schedule(Math.max(0, notBefore - clock.getAsLong()), false);
    }

    private synchronized void schedule(long delayMs, boolean idle) {
        if (closed) return;
        long remaining = Math.max(0, backend.authorizationDeadlineMs() - clock.getAsLong());
        idleTimer = idle;
        long token = ++generation;
        pending = scheduler.schedule(() -> runOnce(token), Math.min(delayMs, remaining));
    }

    private void runOnce(long token) {
        synchronized (this) {
            if (token != generation) return;
            pending = null;
            if (closed) return;
            running = true;
            wakeRequested = false;
        }
        long delay = 0;
        boolean idle = false;
        boolean halt = false;
        try {
            long now = clock.getAsLong();
            if (backend.authorizationDeadlineMs() <= now) {
                backend.onExpired();
                halt = true;
            } else if (now < notBefore) {
                delay = notBefore - now;
            } else if (!backend.hasPending()) {
                backend.onIdle();
                idle = true;
                delay = Math.max(0, backend.authorizationDeadlineMs() - clock.getAsLong());
            } else if (!backend.connected()) {
                delay = 10_000 + random.applyAsInt(5_001);
                rememberRetry(delay);
            } else {
                Result result = backend.uploadHead();
                if (result.kind == Result.Kind.HALTED) {
                    halt = true;
                } else if (result.kind == Result.Kind.RETRY) {
                    delay = retryDelay(result.retryAfterMs);
                    rememberRetry(delay);
                } else {
                    failures = 0;
                    if (backend.retryNotBeforeMs() != 0) backend.saveRetryNotBeforeMs(0);
                    delay = 500 + random.applyAsInt(251);
                    notBefore = add(clock.getAsLong(), delay);
                    if (!backend.hasPending()) {
                        backend.onIdle();
                        idle = true;
                        delay = Math.max(0, backend.authorizationDeadlineMs() - clock.getAsLong());
                    }
                }
            }
        } catch (Exception ignored) {
            // An ambiguous request/response never advances the queue. Retry the same event identity.
            delay = Math.max(retryDelay(0), Math.max(0, notBefore - clock.getAsLong()));
            try { rememberRetry(delay); } catch (Exception persistenceFailure) {
                notBefore = add(clock.getAsLong(), delay);
            }
        } finally {
            synchronized (this) {
                running = false;
                if (halt) closed = true;
                if (idle && wakeRequested) {
                    idle = false;
                    delay = Math.max(0, notBefore - clock.getAsLong());
                }
                if (!closed) schedule(delay, idle);
            }
        }
    }

    private long retryDelay(long serverDelayMs) {
        failures = Math.min(failures + 1, 7);
        long base = Math.min(96_000L, 2_000L << (failures - 1));
        // 2-2.5 seconds initially, capped at 120 seconds locally. Server floors are never capped.
        long localDelay = base + random.applyAsInt((int) (base / 4) + 1);
        // A common Retry-After floor must not synchronize the entire fleet at that boundary.
        long serverDelay = serverDelayMs == 0 ? 0 : add(serverDelayMs, random.applyAsInt(3_001));
        return Math.max(serverDelay, localDelay);
    }

    private void rememberRetry(long delayMs) throws Exception {
        notBefore = add(clock.getAsLong(), delayMs);
        backend.saveRetryNotBeforeMs(notBefore);
    }

    private static long add(long now, long delay) {
        return delay > Long.MAX_VALUE - now ? Long.MAX_VALUE : now + delay;
    }

    @Override
    public synchronized void close() {
        closed = true;
        generation++;
        if (pending != null) pending.cancel();
        pending = null;
    }
}
