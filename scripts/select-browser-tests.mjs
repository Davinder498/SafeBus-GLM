import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browserTestScope, isTestRegistrationOnly } from './lib/browser-test-scope.mjs';

let paths, testRegistrationOnly = false;
const git = args => execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:16*1024*1024});
try {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (/^[0-9a-f]{40}$/.test(base ?? '') && /^[0-9a-f]{40}$/.test(head ?? '')) {
    const ancestor = git(['merge-base',base,head]).trim();
    if (!/^[0-9a-f]{40}$/.test(ancestor)) throw Error('Invalid merge base');
    // Full diff includes removed paths and both sides of renames.
    paths = git(['diff','--name-only','--no-renames','-z',ancestor,head]).split('\0').filter(Boolean);
    if (paths.includes('package.json')) {
      const before = JSON.parse(git(['show',ancestor+':package.json']));
      const after = JSON.parse(git(['show',head+':package.json']));
      testRegistrationOnly = isTestRegistrationOnly(before,after,paths);
    }
  }
} catch {
  // Missing or malformed evidence must require full coverage.
  paths = undefined;
  testRegistrationOnly = false;
}
const result = browserTestScope(process.env.GITHUB_EVENT_NAME, paths, {testRegistrationOnly});
fs.appendFileSync(process.env.GITHUB_OUTPUT, `full=${result.full}\nandroid=${result.android}\n`);
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `### Client coverage\n\nBrowser: ${result.full?'full':'omitted for this PR'}. Android: ${result.android?'full':'omitted for this PR'}. ${result.reason}.\n\nMain commits always run the full suite before production release. Other mandatory checks remain enabled.\n`);
console.log(JSON.stringify(result));
