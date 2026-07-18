import { describe, expect, it } from 'vitest';
import {
  STUDENT_CSV_MAX_BYTES,
  STUDENT_CSV_MAX_ROWS,
  parseStudentCsvFile,
  parseStudentCsvText,
} from '@/utils/studentCsv';

describe('student CSV parser', () => {
  it('parses and trims the supported student columns', () => {
    const result = parseStudentCsvText(
      'first_name,last_name,preferred_name,grade,school_name\r\n Avery , Johnson , Ave , 4 , Central School \r\n',
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        firstName: 'Avery',
        lastName: 'Johnson',
        preferredName: 'Ave',
        grade: '4',
        schoolName: 'Central School',
      },
    ]);
  });

  it('handles BOM, UTF-8, quoted commas, and blank rows', () => {
    const result = parseStudentCsvText(
      '\uFEFFfirst_name,last_name,school_name\n"Renée","O’Neil","École, Centrale"\n\n',
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      firstName: 'Renée',
      lastName: 'O’Neil',
      schoolName: 'École, Centrale',
    });
  });

  it('parses a single student row without delimiter auto-detection warnings', () => {
    const result = parseStudentCsvText('first_name,last_name\nRetry,Student\n');
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('rejects missing, duplicate, and unknown headers', () => {
    const result = parseStudentCsvText('first_name,first_name,address\nAvery,A,Somewhere\n');
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['duplicate_header', 'unknown_header', 'missing_required_header']),
    );
  });

  it('rejects malformed rows and field-length violations', () => {
    const result = parseStudentCsvText(
      `first_name,last_name,preferred_name,grade\n,Johnson,${'P'.repeat(101)},${'G'.repeat(41)},extra\n`,
    );
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['column_count', 'required', 'too_long']),
    );
  });

  it('rejects empty files and files with no data rows', () => {
    expect(parseStudentCsvText('').errors[0]?.code).toBe('empty_file');
    expect(parseStudentCsvText('first_name,last_name\n\n').errors.map((error) => error.code)).toContain(
      'no_data_rows',
    );
  });

  it('accepts 5,000 rows and rejects 5,001 rows', () => {
    const header = 'first_name,last_name\n';
    const fiveThousand = Array.from(
      { length: STUDENT_CSV_MAX_ROWS },
      (_, index) => `First${index},Last${index}`,
    ).join('\n');

    expect(parseStudentCsvText(`${header}${fiveThousand}`).errors).toEqual([]);
    expect(
      parseStudentCsvText(`${header}${fiveThousand}\nOverflow,Student`).errors.map(
        (error) => error.code,
      ),
    ).toContain('row_limit');
  });

  it('rejects files over 5 MB before reading their contents', async () => {
    const file = {
      size: STUDENT_CSV_MAX_BYTES + 1,
      arrayBuffer: () => Promise.reject(new Error('must not read')),
    } as File;
    const result = await parseStudentCsvFile(file);
    expect(result.errors[0]?.code).toBe('file_size');
  });

  it('rejects non-UTF-8 file bytes', async () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0xfd]);
    const file = {
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    } as File;
    const result = await parseStudentCsvFile(file);
    expect(result.errors[0]?.code).toBe('invalid_encoding');
  });
});
