import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { recordsCsv, type DownloadEntity } from './dataDownloads';

describe('CSV downloads', () => {
  it('preserves Unicode, commas, quotes, lines and blank values with spreadsheet-readable encoding', () => {
    const csv = recordsCsv('students', [
      {
        id: 's',
        tenant_id: 't',
        first_name: 'Zoë, "A"',
        last_name: 'Line\nTwo',
        preferred_name: null,
        seat_number: 12,
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const rows = Papa.parse<string[]>(csv.slice(1), { skipEmptyLines: true }).data;
    expect(rows[1][0]).toBe('Zoë, "A"');
    expect(rows[1][1]).toBe('Line\nTwo');
    expect(rows[1][2]).toBe('');
    expect(rows[1][9]).toBe('12');
  });
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1'])(
    'neutralizes spreadsheet formula %j',
    (value) => {
      const csv = recordsCsv('guardians', [{ id: 'g', tenant_id: 't', first_name: value }]);
      expect(Papa.parse<string[]>(csv.slice(1), { skipEmptyLines: true }).data[1][0]).toBe(
        "'" + value,
      );
    },
  );
  it.each<DownloadEntity>(['students', 'guardians', 'drivers', 'buses'])(
    'exports only the documented %s columns',
    (entity) => {
      const csv = recordsCsv(entity, [
        {
          id: 'private-id',
          tenant_id: 'tenant-id',
          token_hash: 'SECRET',
          raw_token: 'SECRET',
          address_line1: 'SECRET',
          license_number: 'SECRET',
          admin_note: 'SECRET',
        },
      ]);
      expect(csv).not.toContain('SECRET');
      expect(csv).not.toContain('private-id');
      expect(csv).not.toContain('tenant-id');
    },
  );
  it('provides headers for an empty filtered result', () => {
    expect(recordsCsv('buses', [])).toContain('"Bus number"');
  });
});
