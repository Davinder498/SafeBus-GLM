import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browserTestScope } from './lib/browser-test-scope.mjs';

let paths;
try {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (/^[0-9a-f]{40}$/.test(base ?? '') && /^[0-9a-f]{40}$/.test(head ?? '')) {
    // Merge-base comparison includes both names for renames, plus deleted paths.
    paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
  }
} catch {
  // Incomplete history, malformed events or oversized evidence require full tests.
}
const result = browserTestScope(process.env.GITHUB_EVENT_NAME, paths);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `full=${result.full}\n`);
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `### Browser coverage\n\n${result.full ? 'Full suite required' : 'Full suite omitted for this PR'}: ${result.reason}.\n\nMain commits always run the full suite before production release.\n`);
console.log(JSON.stringify(result));
