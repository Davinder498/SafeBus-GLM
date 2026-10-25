// @vitest-environment node
import { describe, expect, it } from 'vitest';
import readExcelFile from 'read-excel-file/node';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  digest,
  parseAuthorityRows,
  compareAuthorityDirectory,
  authorityImportSql,
} from '../../../../scripts/lib/authority-directory.mjs';

const workbook = resolve('../../tests/fixtures/authority-directory/authority-2026-10-24.xlsx');
describe('reviewed authority source importer', () => {
  it('reproduces the official source coverage, codes, dates and documented omissions', async () => {
    const source = await readFile(workbook);
    expect(digest(source)).toBe('7ad60759cc326466260c0072d3613c27fa755ff13ad2edc64d391ffbf11204ee');
    const { records, warnings, extractDate } = parseAuthorityRows(await readExcelFile(source));
    expect(records).toHaveLength(445);
    expect(extractDate).toBe('2026-10-24');
    expect(records[0].authority_code).toBe('0009');
    expect(records.filter((row) => !row.address)).toHaveLength(15);
    expect(warnings.map((w) => [w.authorityCode, w.field])).toEqual([
      ['0108', 'website_url'],
      ['9309', 'website_url'],
      ['9413', 'website_url'],
    ]);
    expect(Object.keys(records[0])).not.toContain('Authority Fax');
    expect(records[0].official_name).toBe(
      'Foundations for the Future Charter Academy Charter School Society',
    );
  });
  it('rejects missing headers, duplicate codes and numeric identifiers instead of losing leading zeroes', async () => {
    const sheets = await readExcelFile(workbook);
    for (const alter of [
      (value) => {
        value[0].data[2][0] = 'Renamed field';
      },
      (value) => {
        value[0].data[4][0] = value[0].data[3][0];
      },
      (value) => {
        value[0].data[3][0] = 9;
      },
    ]) {
      const copy = structuredClone(sheets);
      alter(copy);
      expect(() => parseAuthorityRows(copy)).toThrow();
    }
  });
  it('reports changes and withdrawal without planning account or support mutations', async () => {
    const { records } = parseAuthorityRows(await readExcelFile(workbook));
    const old = [
      { ...records[0], official_name: 'Earlier name' },
      { ...records[1], authority_code: '9999' },
    ];
    expect(compareAuthorityDirectory([records[0]], old)).toEqual({
      added: [],
      changed: ['0009'],
      unchanged: [],
      unavailable: ['9999'],
      fieldChanges: {
        '0009': { official_name: { before: 'Earlier name', after: records[0].official_name } },
      },
    });
    const sql = authorityImportSql({
      records: [{ ...records[0], official_name: "Conseil scolaire de l'École" }],
      sourceSha256: 'a'.repeat(64),
    });
    expect(sql).toContain("l''École");
    expect(sql).not.toMatch(
      /(?:update|insert into|delete from) public\.(?:tenants|schools|tenant_support_contacts)/i,
    );
    expect(sql).toContain('Directory baseline changed');
    expect(() => authorityImportSql({ records, sourceSha256: "invalid'" })).toThrow(
      'Invalid import digest',
    );
  });
});
