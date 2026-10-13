import fs from 'node:fs/promises';
import { planningReport, runLocalSimulation } from './lib/capacity-workload.mjs';

const help = `SafeBus capacity workload tools (planning and owned local fixture only)
  --mode=model|simulate       Default: model. No hosted target option exists.
  --scenario=all|pilot|regional|normal|peak|reconnect
  --scale=0.00001..1          Local sample multiplier; default 0.1
  --duration-seconds=1..30    Local duration; default 5
  --seed=1..4294967295        Reproducible tenant distribution; default 42
  --fixture-delay-ms=0..250   Synthetic processing delay, not app latency
  --fixture-reject-every=0..1000  Reject each Nth synthetic request
Reports never certify application capacity. Hosted URLs, credentials and config overrides are rejected.`;

try {
  const args = {};
  const allowed = new Set([
    'mode',
    'scenario',
    'scale',
    'duration-seconds',
    'seed',
    'fixture-delay-ms',
    'fixture-reject-every',
  ]);
  for (const argument of process.argv.slice(2)) {
    if (argument === '--help') {
      console.log(help);
      process.exit(0);
    }
    const match = argument.match(/^--([a-z-]+)=([^\s]+)$/);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(args, match[1]))
      throw new Error('Unknown, malformed or duplicate option. Use --help.');
    args[match[1]] = match[2];
  }
  const mode = args.mode ?? 'model';
  if (!['model', 'simulate'].includes(mode)) throw new Error('Unknown mode.');
  if (mode === 'model' && Object.keys(args).some((key) => !['mode', 'scenario'].includes(key)))
    throw new Error('Simulation options are not accepted in model mode.');
  const workload = JSON.parse(
    await fs.readFile(
      new URL('../docs/governance/capacity-workload.json', import.meta.url),
      'utf8',
    ),
  );
  const value = (key, fallback) => {
    if (!Object.hasOwn(args, key)) return fallback;
    if (!/^\d+(?:\.\d+)?$/.test(args[key])) throw new Error('Invalid numeric option.');
    return Number(args[key]);
  };
  const seconds = value('duration-seconds', 5);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 30)
    throw new Error('Duration must be 1–30 seconds.');
  const report =
    mode === 'model'
      ? planningReport(workload, args.scenario ?? 'all')
      : await runLocalSimulation(workload, {
          scenario: args.scenario ?? 'pilot',
          scale: value('scale', 0.1),
          durationMs: seconds * 1000,
          seed: value('seed', 42),
          fixtureDelayMs: value('fixture-delay-ms', 0),
          fixtureRejectEvery: value('fixture-reject-every', 0),
        });
  console.log(JSON.stringify(report, null, 2));
  if (mode === 'simulate' && !report.generatorPassed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Capacity tool failed.');
  process.exitCode = 1;
}
