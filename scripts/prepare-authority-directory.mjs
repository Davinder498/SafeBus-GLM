#!/usr/bin/env node
// Offline preparation only. This command never connects to or writes a database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import readExcelFile from 'read-excel-file/node';
import {
  AUTHORITY_SOURCE_URL,
  AUTHORITY_LICENCE_URL,
  AUTHORITY_ATTRIBUTION,
  digest,
  parseAuthorityRows,
  compareAuthorityDirectory,
  authorityImportSql,
} from './lib/authority-directory.mjs';

try {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      baseline: { type: 'string' },
      out: { type: 'string' },
      initial: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (
    !values.input ||
    !values.out ||
    (!values.initial && !values.baseline) ||
    (values.initial && values.baseline)
  ) {
    throw new Error(
      'Usage: --input authority.xlsx --out REVIEW_DIRECTORY (--initial | --baseline current-directory.json). No database writes are performed.',
    );
  }
  const bytes = await fs.readFile(values.input);
  const { records, warnings, extractDate } = parseAuthorityRows(await readExcelFile(bytes));
  const baseline = values.initial
    ? { records: [], sourceSha256: null }
    : JSON.parse(await fs.readFile(values.baseline, 'utf8'));
  if (
    !Array.isArray(baseline.records) ||
    (!values.initial && !/^[a-f0-9]{64}$/.test(baseline.sourceSha256))
  )
    throw new Error('A reviewed current-directory baseline is required.');
  const report = {
    mode: 'dry-run',
    sourceUrl: AUTHORITY_SOURCE_URL,
    licenceUrl: AUTHORITY_LICENCE_URL,
    attribution: AUTHORITY_ATTRIBUTION,
    sourceSha256: digest(bytes),
    previousSha256: baseline.sourceSha256,
    sourceExtractDate: extractDate,
    preparedAt: new Date().toISOString(),
    recordCount: records.length,
    categories: Object.fromEntries(
      [...new Set(records.map((r) => r.authority_category))]
        .sort()
        .map((k) => [k, records.filter((r) => r.authority_category === k).length]),
    ),
    missingAddress: records.filter((r) => !r.address).length,
    warnings,
    changes: compareAuthorityDirectory(records, baseline.records),
  };
  await fs.mkdir(values.out, { recursive: true });
  await fs.writeFile(path.join(values.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(
    path.join(values.out, 'directory.json'),
    JSON.stringify({ sourceSha256: report.sourceSha256, records }, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(values.out, 'reviewed-import.sql'),
    authorityImportSql({
      records,
      sourceSha256: report.sourceSha256,
      previousSha256: baseline.sourceSha256,
    }),
  );
  console.log(
    JSON.stringify({
      mode: report.mode,
      recordCount: records.length,
      sourceExtractDate: extractDate,
      warnings: warnings.length,
      report: path.join(values.out, 'report.json'),
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Authority import preparation failed.');
  process.exitCode = 1;
}
