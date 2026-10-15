#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { generateFromOpenApi } from './lib/openapi-database-types.mjs';

const OUTPUT = 'packages/types/src/database.generated.ts';
const checkOnly = process.argv.includes('--check');
const databaseUrl = process.env.SUPABASE_DB_URL;
const projectId = process.env.SUPABASE_PROJECT_ID;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const schemaUrl = process.env.SUPABASE_URL;
const schemaKey = process.env.SUPABASE_SECRET_KEY;

function readSchemaEndpoint(endpoint) {
  return new Promise((resolve, reject) => {
    const schemaRequest = request(
      endpoint,
      {
        method: 'GET',
        headers: {
          apikey: schemaKey,
          Authorization: `Bearer ${schemaKey}`,
          Accept: 'application/openapi+json',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Supabase schema request failed with HTTP ${status}.`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Supabase schema response was not valid JSON.'));
          }
        });
      },
    );
    schemaRequest.setTimeout(30_000, () => {
      schemaRequest.destroy(new Error('Supabase schema request timed out.'));
    });
    schemaRequest.on('error', reject);
    schemaRequest.end();
  });
}

async function generateFromSchemaEndpoint() {
  const endpoint = new URL('/rest/v1/', schemaUrl);
  return generateFromOpenApi(await readSchemaEndpoint(endpoint));
}

function generateWithCli() {
  const require = createRequire(import.meta.url);
  const supabasePackage = require.resolve('supabase/package.json');
  const supabaseCli = path.join(path.dirname(supabasePackage), 'dist', 'supabase.js');
  const targetArguments = databaseUrl ? ['--db-url', databaseUrl] : ['--project-id', projectId];

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [supabaseCli, 'gen', 'types', 'typescript', ...targetArguments, '--schema', 'public'],
      { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const diagnostic = databaseUrl
          ? output.trim().replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]')
          : output.trim();
        reject(
          new Error(
            `Supabase type generation exited with code ${code}.` +
              (diagnostic ? `\n${diagnostic}` : ''),
          ),
        );
      } else {
        resolve(output.replaceAll('\r\n', '\n'));
      }
    });
  });
}

async function generate() {
  if (schemaUrl || schemaKey) {
    if (!schemaUrl || !schemaKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be provided together.');
    }
    return generateFromSchemaEndpoint();
  }
  if (databaseUrl) return generateWithCli();
  if (projectId && /^[a-z0-9]{20}$/.test(projectId) && accessToken) {
    return generateWithCli();
  }
  throw new Error(
    'Set SUPABASE_URL and SUPABASE_SECRET_KEY, SUPABASE_DB_URL, or ' +
      'SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN. Keep credentials protected.',
  );
}

const generated = await generate();
if (!generated.includes('Database {') || !generated.includes('public: {')) {
  throw new Error('Supabase returned an invalid or empty TypeScript schema.');
}

const absoluteOutput = path.join(process.cwd(), OUTPUT);
if (checkOnly) {
  const committed = await fs.readFile(absoluteOutput, 'utf8').catch(() => '');
  if (committed.replaceAll('\r\n', '\n') !== generated) {
    throw new Error(
      `${OUTPUT} is stale. Run pnpm types:generate against the authoritative hosted schema, ` +
        'review the diff, and commit it.',
    );
  }
  console.log('Generated database types match the authoritative hosted schema.');
} else {
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  const temporary = `${absoluteOutput}.tmp`;
  await fs.writeFile(temporary, generated, 'utf8');
  await fs.rename(temporary, absoluteOutput);
  console.log(`Generated ${OUTPUT} from the authoritative hosted schema.`);
}
