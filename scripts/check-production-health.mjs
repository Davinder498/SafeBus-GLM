#!/usr/bin/env node

import process from 'node:process';
import { runProductionHealth } from './lib/production-health.mjs';

try {
  const result = await runProductionHealth({
    origin: process.env.SAFEBUS_MONITOR_ORIGIN,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown health-check failure.';
  console.error(`Production health check failed: ${message}`);
  process.exitCode = 1;
}
