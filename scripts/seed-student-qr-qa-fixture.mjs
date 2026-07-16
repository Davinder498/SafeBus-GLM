#!/usr/bin/env node
import process from 'node:process';
const url = process.env.SAFEBUS_QR_FIXTURE_DATABASE_URL;
if (process.env.SAFEBUS_QR_FIXTURE_CONFIRM !== 'DEV_ONLY') {
  console.error('Refusing to run: set SAFEBUS_QR_FIXTURE_CONFIRM=DEV_ONLY.'); process.exit(1);
}
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Refusing to run: SAFEBUS_QR_FIXTURE_DATABASE_URL must be a hosted DEV Postgres URL.'); process.exit(1);
}
if (/prod|production/i.test(url)) { console.error('Refusing to run against a URL containing prod/production.'); process.exit(1); }
console.log('Phase 16A QR fixture guard passed. Use existing DEV admin/driver seed data, then generate credentials through the UI/RPC with @example.test identities only.');
