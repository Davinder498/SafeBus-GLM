package com.safebusalberta.app.tracking;

import static org.junit.Assert.*;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.PriorityQueue;

import org.junit.Test;

/** Virtual time runs the production scheduler logic, with synthetic FIFO/transport ports. */
public class LocationUploadPumpTest {
    static final class Task implements Comparable<Task> {
        final long at;
        final long order;
        final Runnable run;
        boolean cancelled;
        Task(long at, long order, Runnable run) { this.at = at; this.order = order; this.run = run; }
        @Override public int compareTo(Task other) {
            int byTime = Long.compare(at, other.at);
            return byTime == 0 ? Long.compare(order, other.order) : byTime;
        }
    }

    static final class Time implements LocationUploadPump.Scheduler {
        long now = 100_000;
        long sequence;
        final PriorityQueue<Task> tasks = new PriorityQueue<>();
        @Override public LocationUploadPump.Cancellation schedule(Runnable action, long delay) {
            Task task = new Task(now + delay, sequence++, action);
            tasks.add(task);
            return () -> task.cancelled = true;
        }
        Task next() {
            while (!tasks.isEmpty() && tasks.peek().cancelled) tasks.remove();
            return tasks.peek();
        }
        void step() {
            Task task = next();
            assertNotNull("expected a scheduled task", task);
            tasks.remove();
            now = task.at;
            task.run.run();
        }
        long delay() { return next().at - now; }
        long activeTasks() { return tasks.stream().filter(task -> !task.cancelled).count(); }
    }

    static final class Backend implements LocationUploadPump.Backend {
        final Time time;
        final Deque<String> fifo = new ArrayDeque<>();
        final Deque<Object> outcomes = new ArrayDeque<>();
        final List<String> sent = new ArrayList<>();
        final List<String> acknowledged = new ArrayList<>();
        final List<Long> sentAt = new ArrayList<>();
        long deadline;
        long persistedDelay;
        boolean online = true;
        boolean expired;
        int idleCalls;
        boolean failSave;
        Runnable duringUpload;
        Runnable duringIdle;
        Backend(Time time, String... entries) {
            this.time = time;
            deadline = time.now + 18 * 60 * 60 * 1_000L;
            fifo.addAll(Arrays.asList(entries));
        }
        @Override public long authorizationDeadlineMs() { return deadline; }
        @Override public boolean hasPending() { return !fifo.isEmpty(); }
        @Override public boolean connected() { return online; }
        @Override public long retryNotBeforeMs() { return persistedDelay; }
        @Override public void saveRetryNotBeforeMs(long value) throws Exception {
            if (failSave) throw new IOException("synthetic persistence failure");
            persistedDelay = value;
        }
        @Override public LocationUploadPump.Result uploadHead() throws Exception {
            String event = fifo.peek();
            sent.add(event);
            sentAt.add(time.now);
            if (duringUpload != null) duringUpload.run();
            Object scripted = outcomes.poll();
            if (scripted instanceof Exception) throw (Exception) scripted;
            LocationUploadPump.Result result = scripted == null
                ? LocationUploadPump.Result.progress() : (LocationUploadPump.Result) scripted;
            if (result.kind == LocationUploadPump.Result.Kind.PROGRESS) acknowledged.add(fifo.remove());
            return result;
        }
        @Override public void onIdle() {
            idleCalls++;
            if (duringIdle != null) duringIdle.run();
        }
        @Override public void onExpired() { expired = true; }
    }

    static LocationUploadPump pump(Backend backend, boolean maximumJitter) {
        return new LocationUploadPump(backend, backend.time, () -> backend.time.now,
            bound -> maximumJitter ? bound - 1 : 0);
    }

    @Test public void fifoDrainsWithoutGpsCallbacksWithMinimumGap() {
        Time time = new Time();
        Backend backend = new Backend(time, "event-a", "event-b", "event-c");
        LocationUploadPump pump = pump(backend, false);
        pump.wake();
        time.step(); time.step(); time.step();
        assertEquals(Arrays.asList("event-a", "event-b", "event-c"), backend.acknowledged);
        assertEquals(Arrays.asList(100_000L, 100_500L, 101_000L), backend.sentAt);
        assertTrue(backend.fifo.isEmpty());
        assertEquals(1, backend.idleCalls);
        pump.close();
        assertNull(time.next());
    }

    @Test public void maximumJitterSpreadsStartupAndSuccesses() {
        Time time = new Time();
        Backend backend = new Backend(time, "a", "b");
        LocationUploadPump pump = pump(backend, true);
        pump.wake();
        assertEquals(3_000, time.delay());
        time.step();
        assertEquals(750, time.delay());
        time.step();
        assertEquals(Arrays.asList(103_000L, 103_750L), backend.sentAt);
    }

    @Test public void repeatedWakeCannotBypassThrottleOrGrowScheduledQueue() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.outcomes.add(LocationUploadPump.Result.retry(60_000));
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        for (int i = 0; i < 1_000; i++) pump.wake();
        assertEquals(1, time.activeTasks());
        assertEquals(60_000, time.delay());
        assertEquals(Arrays.asList("a"), backend.sent);
        time.step();
        assertEquals(Arrays.asList("a", "a"), backend.sent);
        assertEquals(Arrays.asList("a"), backend.acknowledged);
    }

    @Test public void failuresRetainHeadAndBackOffExponentially() {
        Time time = new Time();
        Backend backend = new Backend(time, "a", "b");
        backend.outcomes.add(new IOException("synthetic disconnect"));
        backend.outcomes.add(LocationUploadPump.Result.retry(0));
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        assertEquals(2_000, time.delay());
        assertEquals(Arrays.asList("a", "b"), new ArrayList<>(backend.fifo));
        time.step(); assertEquals(4_000, time.delay());
        time.step(); assertEquals(500, time.delay());
        assertEquals(0, backend.persistedDelay);
        time.step();
        assertEquals(Arrays.asList("a", "a", "a", "b"), backend.sent);
        assertEquals(Arrays.asList("a", "b"), backend.acknowledged);
    }

    @Test public void localBackoffIsCappedAndResetsAfterProgress() {
        Time time = new Time();
        Backend backend = new Backend(time, "a", "b");
        for (int i = 0; i < 12; i++) backend.outcomes.add(LocationUploadPump.Result.retry(0));
        backend.outcomes.add(LocationUploadPump.Result.progress());
        backend.outcomes.add(LocationUploadPump.Result.retry(0));
        LocationUploadPump pump = pump(backend, true);
        pump.wake();
        for (int i = 0; i < 12; i++) {
            time.step();
            assertTrue(time.delay() <= 120_000);
        }
        assertEquals(120_000, time.delay());
        time.step(); assertEquals(750, time.delay());
        time.step(); assertEquals(2_500, time.delay());
    }

    @Test public void serverDelayBeyondLocalCapIsHonoured() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.outcomes.add(LocationUploadPump.Result.retry(600_000));
        LocationUploadPump pump = pump(backend, true);
        pump.wake(); time.step();
        assertEquals(603_000, time.delay());
        time.step();
        assertEquals(603_000L, (long) backend.sentAt.get(1) - backend.sentAt.get(0));
    }

    @Test public void restartKeepsQueueIdentityAndPersistedServerFloor() {
        Time time = new Time();
        Backend backend = new Backend(time, "a", "b");
        backend.outcomes.add(LocationUploadPump.Result.retry(60_000));
        LocationUploadPump original = pump(backend, false);
        original.wake(); time.step(); original.close();
        time.now += 1_000;
        LocationUploadPump replacement = pump(backend, false);
        replacement.wake();
        assertEquals(59_000, time.delay());
        time.step(); time.step();
        assertEquals(Arrays.asList("a", "a", "b"), backend.sent);
        assertEquals(Arrays.asList("a", "b"), backend.acknowledged);
    }

    @Test public void offlineRecoveryNeedsNoNewFixOrServiceRestart() {
        Time time = new Time();
        Backend backend = new Backend(time, "paused-or-ended-event");
        backend.online = false;
        LocationUploadPump pump = pump(backend, true);
        pump.wake(); time.step();
        assertEquals(15_000, time.delay());
        assertTrue(backend.sent.isEmpty());
        backend.online = true;
        time.step();
        assertEquals(Arrays.asList("paused-or-ended-event"), backend.acknowledged);
    }

    @Test public void expiryDuringServerWaitStopsWithoutAnotherRequest() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.deadline = time.now + 10_000;
        backend.outcomes.add(LocationUploadPump.Result.retry(Long.MAX_VALUE));
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        assertEquals(10_000, time.delay());
        time.step();
        assertTrue(backend.expired);
        assertEquals(Arrays.asList("a"), backend.sent);
        assertEquals(Arrays.asList("a"), new ArrayList<>(backend.fifo));
        assertNull(time.next());
    }

    @Test public void expiredOrMissingAuthorizationNeverTransmits() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.deadline = 0;
        LocationUploadPump pump = pump(backend, true);
        pump.wake(); time.step();
        assertTrue(backend.expired);
        assertTrue(backend.sent.isEmpty());
        assertEquals(1, backend.fifo.size());
    }

    @Test public void permanentDenialDoesNotRetryOrDiscardHead() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.outcomes.add(LocationUploadPump.Result.halted());
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step(); pump.wake();
        assertEquals(Arrays.asList("a"), backend.sent);
        assertEquals(1, backend.fifo.size());
        assertNull(time.next());
    }

    @Test public void closeCancelsPendingWorkAndIgnoresAlreadyDequeuedCallback() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        LocationUploadPump pump = pump(backend, true);
        pump.wake();
        Task stale = time.next();
        pump.close(); stale.run.run(); pump.wake();
        assertTrue(backend.sent.isEmpty());
        assertNull(time.next());
    }

    @Test public void wakeDuringAnUploadDoesNotCreateConcurrentRequests() {
        Time time = new Time();
        Backend backend = new Backend(time, "a", "b");
        LocationUploadPump pump = pump(backend, false);
        backend.duringUpload = () -> {
            for (int i = 0; i < 1_000; i++) pump.wake();
            assertEquals(0, time.activeTasks());
            time.now += 1_000; // slow network; spacing starts at completion
        };
        pump.wake(); time.step();
        assertEquals(1, time.activeTasks());
        assertEquals(500, time.delay());
        time.step();
        assertEquals(Arrays.asList(100_000L, 101_500L), backend.sentAt);
    }

    @Test public void newFixCancelsOnlyIdleExpiryTimerAndIgnoresItsStaleCallback() {
        Time time = new Time();
        Backend backend = new Backend(time);
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        Task stale = time.next();
        backend.fifo.add("a"); pump.wake();
        stale.run.run(); // cancellation can race with scheduler dequeue
        assertEquals(1, time.activeTasks());
        time.step();
        assertEquals(Arrays.asList("a"), backend.acknowledged);
    }

    @Test public void fixArrivingDuringIdleTransitionIsNotStranded() {
        Time time = new Time();
        Backend backend = new Backend(time);
        LocationUploadPump pump = pump(backend, false);
        backend.duringIdle = () -> {
            backend.duringIdle = null;
            backend.fifo.add("a"); pump.wake();
        };
        pump.wake(); time.step();
        assertEquals(0, time.delay());
        time.step();
        assertEquals(Arrays.asList("a"), backend.acknowledged);
    }

    @Test public void persistenceFailureDoesNotLoseOrImmediatelyResendQueuedEvent() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.failSave = true;
        backend.outcomes.add(new IOException("synthetic disconnect"));
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        assertTrue(time.delay() >= 2_000);
        assertEquals(1, backend.fifo.size());
        assertEquals(1, backend.sent.size());
    }

    @Test public void persistenceFailureCannotShortenServerRetryFloor() {
        Time time = new Time();
        Backend backend = new Backend(time, "a");
        backend.failSave = true;
        backend.outcomes.add(LocationUploadPump.Result.retry(600_000));
        LocationUploadPump pump = pump(backend, false);
        pump.wake(); time.step();
        assertEquals(600_000, time.delay());
        assertEquals(1, backend.fifo.size());
    }
}
