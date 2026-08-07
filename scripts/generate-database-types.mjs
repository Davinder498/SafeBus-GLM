#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUTPUT = 'packages/types/src/database.generated.ts';
const checkOnly = process.argv.includes('--check');
const projectId = process.env.SUPABASE_PROJECT_ID;

if (!projectId || !/^[a-z0-9]{20}$/.test(projectId)) {
  throw new Error('SUPABASE_PROJECT_ID is required and must be a 20-character project reference.');
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error('SUPABASE_ACCESS_TOKEN is required. Keep it in a protected CI environment.');
}

function runGenerator() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'exec',
        'supabase',
        'gen',
        'types',
        'typescript',
        '--project-id',
        projectId,
        '--schema',
        'public',
      ],
      { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Supabase type generation exited with code ${code}.`));
      else resolve(output.replaceAll('\r\n', '\n'));
    });
  });
}

const generated = await runGenerator();
if (!generated.includes('export type Database') || !generated.includes('public: {')) {
  throw new Error('Supabase returned an invalid or empty TypeScript schema.');
}

const absoluteOutput = path.join(process.cwd(), OUTPUT);
if (checkOnly) {
  const committed = await fs.readFile(absoluteOutput, 'utf8').catch(() => '');
  if (committed.replaceAll('\r\n', '\n') !== generated) {
    throw new Error(
      `${OUTPUT} is stale. Run pnpm types:generate against the authoritative staging schema, ` +
        'review the diff, and commit it.',
    );
  }
  console.log('Generated database types match the authoritative schema.');
} else {
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  const temporary = `${absoluteOutput}.tmp`;
  await fs.writeFile(temporary, generated, 'utf8');
  await fs.rename(temporary, absoluteOutput);
  console.log(`Generated ${OUTPUT} from the authoritative hosted schema.`);
}
