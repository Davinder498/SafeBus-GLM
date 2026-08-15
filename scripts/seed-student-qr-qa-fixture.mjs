#!/usr/bin/env node
console.error(
  'QR fixture setup is disabled: the sole hosted database is production. ' +
    'A separately approved non-production database is required.',
);
process.exitCode = 1;
