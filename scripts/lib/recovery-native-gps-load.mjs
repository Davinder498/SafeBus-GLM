import { randomUUID } from "node:crypto";
import { Agent, request } from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { RECOVERY_AUTH_URL } from "./recovery-auth.mjs";
import { capacityFetch } from "./recovery-capacity-lifecycle.mjs";
import { capacityGpsLatitude } from "./recovery-capacity-gps.mjs";
import { percentiles } from "./recovery-capacity-scheduler.mjs";

const endpoint =
  RECOVERY_AUTH_URL + "/rest/v1/rpc/ingest_driver_location_event";
const periodMs = 3000;
const minimumUploadPauseMs = 500;
const rejectedFixReasons = new Set([
  "out_of_order",
  "trip_not_active",
  "stale_fix",
  "invalid_fix",
  "impossible_jump",
]);

export async function verifyNativeGpsPositions(db, latest) {
  if (!latest.size) return false;
  const { rows } = await db.query(
    `select loc.driver_trip_id,loc.latitude,loc.longitude,loc.recorded_at,state.last_sequence
     from public.driver_trip_current_locations loc
     join public.bus_tracking_sessions session on session.driver_trip_id=loc.driver_trip_id
       and session.status='active'
     join safebus_private.driver_tracking_state state on state.device_id=session.device_id
       and state.last_trip_id=loc.driver_trip_id
     where loc.driver_trip_id=any($1::uuid[]) and loc.source='android_native'`,
    [[...latest.keys()]],
  );
  const verified = new Set();
  for (const row of rows) {
    const expected = latest.get(row.driver_trip_id);
    if (
      !expected ||
      verified.has(row.driver_trip_id) ||
      row.latitude !== expected.latitude ||
      row.longitude !== -113.81 ||
      new Date(row.recorded_at).getTime() !== Date.parse(expected.recordedAt) ||
      Number(row.last_sequence) !== expected.sequence
    )
      return false;
    verified.add(row.driver_trip_id);
  }
  return verified.size === latest.size;
}

// One shared HTTPS pool for the Recovery probe. Each simulated phone still sends
// its own authenticated request, and time spent waiting for a socket counts.
export function createNativeGpsTransport() {
  const agent = new Agent({ keepAlive: true, maxSockets: 256 });
  let writes = 0;
  let responses = 0;
  let failures = {};
  const knownCodes = new Set([
    "ABORT_ERR",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENOBUFS",
    "EMFILE",
    "EADDRNOTAVAIL",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "NATIVE_GPS_RESPONSE_TOO_LARGE",
  ]);
  return {
    fetch: async (url, init) => {
      if (url !== endpoint) throw Error("CAPACITY_ORIGIN_REJECTED");
      try {
        return await new Promise((resolve, reject) => {
          const req = request(
            url,
            {
              method: init.method,
              headers: {
                ...init.headers,
                "content-length": Buffer.byteLength(init.body),
              },
              signal: init.signal,
              agent,
            },
            async (res) => {
              responses++;
              try {
                const chunks = [];
                let bytes = 0;
                for await (const chunk of res) {
                  bytes += chunk.length;
                  if (bytes > 65536)
                    throw Error("NATIVE_GPS_RESPONSE_TOO_LARGE");
                  chunks.push(chunk);
                }
                const status = res.statusCode;
                const body = [204, 205, 304].includes(status)
                  ? null
                  : Buffer.concat(chunks);
                resolve(new Response(body, { status }));
              } catch (error) {
                reject(error);
              }
            },
          );
          req.once("error", reject);
          req.once("finish", () => writes++);
          req.end(init.body);
        });
      } catch (error) {
        const code = error.code ?? error.message;
        const category =
          init.signal?.reason?.name === "TimeoutError"
            ? "REQUEST_DEADLINE"
            : knownCodes.has(code)
              ? code
              : "OTHER";
        failures[category] = (failures[category] ?? 0) + 1;
        throw error;
      }
    },
    takeMetrics() {
      const metrics = { writes, responses, failures };
      writes = 0;
      responses = 0;
      failures = {};
      return metrics;
    },
    close: () => agent.destroy(),
  };
}

export function createNativeGpsUpload(publishableKey, fetchImpl = fetch) {
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? "")) {
    // Legacy public keys are usable here only if their claims name Recovery.
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(publishableKey.split(".")[1], "base64url").toString(),
      );
    } catch {
      throw Error("NATIVE_GPS_PUBLIC_KEY_REQUIRED");
    }
    if (
      claims.role !== "anon" ||
      `https://${claims.ref}.supabase.co` !== RECOVERY_AUTH_URL
    )
      throw Error("NATIVE_GPS_PUBLIC_KEY_REQUIRED");
  }
  return async (driver, sequence, recordedAt, latitude, signal) => {
    const response = await capacityFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${driver.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_tracking_token: driver.trackingToken,
          p_device_credential: driver.deviceCredential,
          p_event_id: randomUUID(),
          p_sequence: sequence,
          p_recorded_at: recordedAt,
          p_latitude: latitude,
          p_longitude: -113.81,
          p_accuracy_m: 5,
          p_heading_deg: null,
          p_speed_mps: 5,
          p_battery_percent: 80,
          p_connectivity: "cellular",
        }),
      },
      { origin: RECOVERY_AUTH_URL, fetchImpl, signal },
    );
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      throw Error(
        status >= 400 && status <= 599
          ? `NATIVE_GPS_HTTP_${status}`
          : "NATIVE_GPS_HTTP",
      );
    }
    const ack = await response.json();
    if (ack?.accepted === false && rejectedFixReasons.has(ack.rejectionReason))
      throw Error("NATIVE_GPS_REJECTED_" + ack.rejectionReason.toUpperCase());
    if (
      ack?.accepted !== true ||
      ack.duplicate !== false ||
      ack.stopTracking !== false ||
      ack.tripState !== "active" ||
      Date.parse(ack.recordedAt) !== Date.parse(recordedAt)
    )
      throw Error("NATIVE_GPS_ACK_MISMATCH");
  };
}

// Each driver has their own application credentials and starting sequence.
// Absolute arrival times ensure a slow response cannot reduce offered load
// without failing the measurement. No request retry masks a missed deadline.
export async function measureNativeGps({
  drivers,
  rounds,
  pattern,
  upload,
  verifyPositions,
  signal,
  maxInFlight = 10_000,
  queueBusySlots = false,
  waitForUpload = (ms, abortSignal) => delay(ms, undefined, { signal: abortSignal }),
  clock = () => performance.now(),
  wallClock = Date.now,
  wait = delay,
}) {
  const distinct = (field) =>
    new Set(drivers.map((driver) => driver[field])).size === drivers.length;
  if (
    drivers.length < 1 ||
    drivers.length > 10_000 ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > 200 ||
    !["staggered", "synchronized"].includes(pattern) ||
    !Number.isInteger(maxInFlight) ||
    maxInFlight < 1 ||
    maxInFlight > 10_000 ||
    typeof queueBusySlots !== "boolean" ||
    typeof waitForUpload !== "function" ||
    typeof upload !== "function" ||
    typeof verifyPositions !== "function" ||
    drivers.some(
      (d) =>
        !d.tripId ||
        !d.accessToken ||
        !d.trackingToken ||
        !d.deviceCredential ||
        !Number.isSafeInteger(d.lastSequence) ||
        d.lastSequence < 0 ||
        d.lastSequence > Number.MAX_SAFE_INTEGER - rounds,
    ) ||
    !["tripId", "accessToken", "trackingToken", "deviceCredential"].every(
      distinct,
    )
  )
    throw Error("NATIVE_GPS_LOAD_BOUNDS");

  const started = clock();
  const beganAt = wallClock();
  const slots = drivers.length * rounds;
  const latency = [];
  const latest = new Map();
  const pending = new Set();
  const uploading = new Set();
  const nextUploadAt = new Map();
  const tails = new Map();
  const depths = new Map();
  const errors = {};
  let offered = 0;
  let accepted = 0;
  let lastAcknowledgementMs = null;
  let late = 0;
  let deviceBackpressure = 0;
  let busyInFlight = 0;
  let busyCooldown = 0;
  let maxQueueDelayMs = 0;
  let maxDeviceQueueDepth = 0;
  let cancelledBeforeSend = 0;
  let maxDispatchLagMs = 0;
  const fail = (code) => {
    errors[code] = (errors[code] ?? 0) + 1;
  };

  for (let slot = 0; slot < slots; slot++) {
    if (signal?.aborted || Object.keys(errors).length) break;
    const index = slot % drivers.length;
    const round = Math.floor(slot / drivers.length);
    const offset =
      round * periodMs +
      (pattern === "staggered" ? (index * periodMs) / drivers.length : 0);
    const due = started + offset;
    const waitMs = due - clock();
    if (waitMs > 0) await wait(waitMs);
    if (signal?.aborted || Object.keys(errors).length) break;
    const dispatchedAt = clock();
    const lag = dispatchedAt - due;
    maxDispatchLagMs = Math.max(maxDispatchLagMs, lag);
    if (lag > 1000) {
      fail("NATIVE_GPS_GENERATOR_LAG");
      break;
    }
    const driver = drivers[index];
    // In the sustained profile, emulate Android's FIFO rather than losing a
    // collected fix when an earlier send or its post-success pause is pending.
    // Keep absolute collection times, and count queue time toward the same
    // three-second acceptance deadline. Short diagnostic profiles stay strict.
    const previous = queueBusySlots ? tails.get(driver.tripId) : null;
    const busy = Boolean(previous) || uploading.has(driver.tripId);
    const cooling = dispatchedAt < (nextUploadAt.get(driver.tripId) ?? 0);
    if (busy || cooling) {
      deviceBackpressure++;
      if (busy) busyInFlight++;
      else busyCooldown++;
      if (!queueBusySlots) continue;
    }
    if (queueBusySlots && (depths.get(driver.tripId) ?? 0) >= 2) {
      fail("NATIVE_GPS_DEVICE_QUEUE_LIMIT");
      break;
    }
    if (pending.size >= maxInFlight) {
      fail("NATIVE_GPS_IN_FLIGHT_LIMIT");
      break;
    }

    const sequence = driver.lastSequence + round + 1;
    const recordedAt = new Date(beganAt + Math.floor(offset)).toISOString();
    const latitude = capacityGpsLatitude(sequence);
    if (queueBusySlots) {
      const depth = (depths.get(driver.tripId) ?? 0) + 1;
      depths.set(driver.tripId, depth);
      maxDeviceQueueDepth = Math.max(maxDeviceQueueDepth, depth);
    } else {
      offered++;
      uploading.add(driver.tripId);
    }
    let uploadStarted = false;
    const request = Promise.resolve(previous)
      .then(async () => {
        if (queueBusySlots) {
          const pauseRemaining = (nextUploadAt.get(driver.tripId) ?? 0) - clock();
          if (pauseRemaining > 0) await waitForUpload(pauseRemaining, signal);
          if (signal?.aborted || Object.keys(errors).length)
            throw Error("NATIVE_GPS_UNSENT_CANCELLED");
          maxQueueDelayMs = Math.max(maxQueueDelayMs, clock() - dispatchedAt);
          offered++;
          uploading.add(driver.tripId);
        }
        uploadStarted = true;
        return upload(driver, sequence, recordedAt, latitude, signal);
      })
      .then(
        () => {
          const acknowledgedAt = clock();
          const elapsed = acknowledgedAt - due;
          latency.push(elapsed);
          lastAcknowledgementMs = acknowledgedAt - started;
          // Use the real Android pause range upper bound for reproducible A-B-A.
          nextUploadAt.set(driver.tripId, clock() + (queueBusySlots ? 750 : minimumUploadPauseMs));
          if (elapsed > periodMs) late++;
          accepted++;
          if ((latest.get(driver.tripId)?.sequence ?? -1) < sequence)
            latest.set(driver.tripId, { sequence, recordedAt, latitude });
        },
        (error) => {
          const code = error?.message;
          if (!uploadStarted && (signal?.aborted || code === "NATIVE_GPS_UNSENT_CANCELLED")) {
            cancelledBeforeSend++;
            return;
          }
          fail(
            /^NATIVE_GPS_(HTTP(?:_[45]\d\d)?|ACK_MISMATCH|REJECTED_(OUT_OF_ORDER|TRIP_NOT_ACTIVE|STALE_FIX|INVALID_FIX|IMPOSSIBLE_JUMP))$/.test(
              code,
            )
              ? code
              : "NATIVE_GPS_TRANSPORT",
          );
        },
      )
      .finally(() => {
        uploading.delete(driver.tripId);
        if (queueBusySlots) {
          const depth = (depths.get(driver.tripId) ?? 1) - 1;
          if (depth) depths.set(driver.tripId, depth);
          else depths.delete(driver.tripId);
          if (tails.get(driver.tripId) === request) tails.delete(driver.tripId);
        }
        pending.delete(request);
      });
    if (queueBusySlots) tails.set(driver.tripId, request);
    pending.add(request);
  }
  await Promise.all(pending);
  if (signal?.aborted) fail("NATIVE_GPS_CANCELLED");
  let reconciled = false;
  if (latest.size === drivers.length) {
    try {
      reconciled = (await verifyPositions(latest)) === true;
    } catch {
      fail("NATIVE_GPS_VERIFY_FAILED");
    }
  }
  return {
    pattern,
    drivers: drivers.length,
    rounds,
    planned: slots,
    offered,
    accepted,
    unsent: slots - offered,
    unacknowledged: offered - accepted,
    late,
    deviceBackpressure,
    busyInFlight,
    busyCooldown,
    maxQueueDelayMs,
    maxDeviceQueueDepth,
    cancelledBeforeSend,
    queueBusySlots,
    maxDispatchLagMs,
    latencyMs: percentiles(latency),
    lastAcknowledgementMs,
    errors,
    reconciled,
    passed:
      accepted === slots &&
      late === 0 &&
      Object.keys(errors).length === 0 &&
      reconciled,
  };
}
