#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const OUTPUT = 'packages/types/src/database.generated.ts';
const checkOnly = process.argv.includes('--check');
const databaseUrl = process.env.SUPABASE_DB_URL;
const projectId = process.env.SUPABASE_PROJECT_ID;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const schemaUrl = process.env.SUPABASE_URL;
const schemaKey = process.env.SUPABASE_SECRET_KEY;

// PostgREST only advertises functions executable by the role represented by
// the schema key. These authenticated-only functions are intentionally hidden
// from service_role and are therefore completed from their canonical migration
// definitions when the OpenAPI fallback is used.
const AUTHENTICATED_ONLY_FUNCTIONS = {
  enforce_new_password_policy: {
    properties: { p_password: { type: 'string', format: 'text' } },
    required: new Set(['p_password']),
  },
  is_current_user_session_active: { properties: {}, required: new Set() },
  record_student_record_access: {
    properties: { p_student_id: { type: 'string', format: 'uuid' } },
    required: new Set(['p_student_id']),
  },
  register_current_user_session: {
    properties: {
      p_device_label: { type: 'string', format: 'text' },
      p_user_agent: { type: 'string', format: 'text' },
    },
    required: new Set(),
  },
};

// PostgreSQL allows NULL for these parameters even though PostgREST's OpenAPI
// metadata describes only their scalar format.
const NULLABLE_FUNCTION_ARGUMENTS = new Set([
  'admin_renew_bus_route_assignment.p_effective_to',
  'admin_set_guardian_access_expiry.p_access_expires_at',
  'admin_update_bus_route_assignment.p_effective_to',
]);

function quoteProperty(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function indent(lines, spaces) {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line ? `${prefix}${line}` : line));
}

function jsonType(property, enums) {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    const enumName = property.format?.startsWith('public.')
      ? property.format.slice('public.'.length)
      : undefined;
    if (enumName) {
      enums.set(enumName, property.enum);
      return `Database["public"]["Enums"][${JSON.stringify(enumName)}]`;
    }
    return property.enum.map(JSON.stringify).join(' | ');
  }

  if (property.type === 'array') {
    return `Array<${jsonType(property.items ?? {}, enums)}>`;
  }
  if (property.type === 'boolean') return 'boolean';
  if (property.type === 'integer' || property.type === 'number') return 'number';
  if (property.type === 'string') return 'string';
  return 'Json';
}

function isNullableProperty(property, required, name) {
  if (!required.has(name)) return true;
  // PostgREST marks nullable columns as not required, but function arguments
  // may be required by PostgreSQL while still accepting SQL NULL.
  return property.description?.includes('nullable') ?? false;
}

function foreignKey(property) {
  const match = property.description?.match(
    /Foreign Key to `([^`.]+)\.([^`]+)`\.<fk table='([^']+)' column='([^']+)'\/>/,
  );
  if (!match) return undefined;
  return { referencedRelation: match[3], referencedColumn: match[4] };
}

function objectType(properties, required, enums, mode, nullableNames = new Set()) {
  const lines = ['{'];
  for (const [name, property] of Object.entries(properties)) {
    const isNullable = nullableNames.has(name) || isNullableProperty(property, required, name);
    const isOptional = mode !== 'row' && (mode === 'update' || isNullable || 'default' in property);
    const type = `${jsonType(property, enums)}${isNullable ? ' | null' : ''}`;
    lines.push(`  ${quoteProperty(name)}${isOptional ? '?' : ''}: ${type}`);
  }
  lines.push('}');
  return lines;
}

function generateFromOpenApi(schema) {
  if (!schema || typeof schema !== 'object' || !schema.definitions || !schema.paths) {
    throw new Error('The Supabase schema endpoint returned invalid OpenAPI metadata.');
  }

  const enums = new Map();
  const tableBlocks = [];
  for (const tableName of Object.keys(schema.definitions).sort()) {
    const definition = schema.definitions[tableName];
    const properties = definition.properties ?? {};
    const required = new Set(definition.required ?? []);
    const relationships = [];
    for (const [column, property] of Object.entries(properties)) {
      const target = foreignKey(property);
      if (!target) continue;
      relationships.push({ column, ...target });
    }

    const block = [`${quoteProperty(tableName)}: {`];
    block.push('  Row: ' + objectType(properties, required, enums, 'row')[0]);
    block.push(...indent(objectType(properties, required, enums, 'row').slice(1), 2));
    block.push('  Insert: ' + objectType(properties, required, enums, 'insert')[0]);
    block.push(...indent(objectType(properties, required, enums, 'insert').slice(1), 2));
    block.push('  Update: ' + objectType(properties, required, enums, 'update')[0]);
    block.push(...indent(objectType(properties, required, enums, 'update').slice(1), 2));
    if (relationships.length === 0) {
      block.push('  Relationships: []');
    } else {
      block.push('  Relationships: [');
      for (const relationship of relationships) {
        block.push('    {');
        block.push(
          `      foreignKeyName: ${JSON.stringify(`${tableName}_${relationship.column}_fkey`)}`,
        );
        block.push(`      columns: [${JSON.stringify(relationship.column)}]`);
        block.push('      isOneToOne: false');
        block.push(`      referencedRelation: ${JSON.stringify(relationship.referencedRelation)}`);
        block.push(`      referencedColumns: [${JSON.stringify(relationship.referencedColumn)}]`);
        block.push('    },');
      }
      block.push('  ]');
    }
    block.push('}');
    tableBlocks.push(block);
  }

  const functions = new Map();
  for (const rpcPath of Object.keys(schema.paths).filter((entry) => entry.startsWith('/rpc/'))) {
    const operation = schema.paths[rpcPath].post ?? schema.paths[rpcPath].get ?? {};
    const body = operation.parameters?.find((parameter) => parameter.in === 'body')?.schema ?? {};
    functions.set(rpcPath.slice('/rpc/'.length), {
      properties: body.properties ?? {},
      required: new Set(body.required ?? []),
    });
  }
  for (const [functionName, definition] of Object.entries(AUTHENTICATED_ONLY_FUNCTIONS)) {
    if (!functions.has(functionName)) {
      functions.set(functionName, definition);
    }
  }

  const functionBlocks = [];
  for (const [functionName, definition] of [...functions].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const nullableArguments = new Set(
      [...NULLABLE_FUNCTION_ARGUMENTS]
        .filter((entry) => entry.startsWith(`${functionName}.`))
        .map((entry) => entry.slice(functionName.length + 1)),
    );
    const block = [`${quoteProperty(functionName)}: {`];
    block.push(
      '  Args: ' +
        objectType(definition.properties, definition.required, enums, 'insert', nullableArguments)[0],
    );
    block.push(
      ...indent(
        objectType(
          definition.properties,
          definition.required,
          enums,
          'insert',
          nullableArguments,
        ).slice(1),
        2,
      ),
    );
    // OpenAPI does not include PostgreSQL function return schemas. Unknown
    // forces callers to validate or explicitly narrow each application RPC.
    block.push('  Returns: unknown');
    block.push('}');
    functionBlocks.push(block);
  }

  const enumBlocks = [...enums.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, values]) => `${quoteProperty(name)}: ${values.map(JSON.stringify).join(' | ')}`);

  const lines = [
    '// This file is generated. Do not edit it by hand.',
    '// Run `pnpm types:generate` against the authoritative hosted Supabase schema.',
    '',
    'export type Json =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | { [key: string]: Json | undefined }',
    '  | Json[]',
    '',
    'export interface Database {',
    '  public: {',
    '    Tables: {',
    ...tableBlocks.flatMap((block) => indent(block, 6)),
    '    }',
    '    Views: {',
    '      [_ in never]: never',
    '    }',
    '    Functions: {',
    ...functionBlocks.flatMap((block) => indent(block, 6)),
    '    }',
    '    Enums: {',
    ...indent(enumBlocks, 6),
    '    }',
    '    CompositeTypes: {',
    '      [_ in never]: never',
    '    }',
    '  }',
    '}',
    '',
  ];
  return lines.join('\n');
}

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
  const targetArguments = databaseUrl
    ? ['--db-url', databaseUrl]
    : ['--project-id', projectId];

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
