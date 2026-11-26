import {
  createDirectBatchWriter, createDirectGpsBatcher, createDirectGpsServer, createSupabaseClaimsVerifier,
} from '../../services/tracking-ingestion/direct-batch.mjs';

// One instance owns four writer connections. Rollout and fleet-wide admission
// are managed separately from this process.
export function createReceiver({pool, auth, issuer}) {
  const batcher = createDirectGpsBatcher({
    verify: createSupabaseClaimsVerifier({auth, issuer}),
    write: createDirectBatchWriter({pool}),
    batchSize: 100, maxWaitMs: 50, maxInFlight: 4, maxPending: 5000,
  });
  const server = createDirectGpsServer({batcher});
  server.maxConnections = 5000;
  server.keepAliveTimeout = 60000;
  return {server, close: async () => {
    // server.close waits for connected requests; the caller owns the database pool.
    try { await new Promise((resolve,reject) => server.close(e => e ? reject(e) : resolve())); }
    finally { batcher.close(); }
  }};
}
