import Papa, { type ParseError } from 'papaparse';

export const STUDENT_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const STUDENT_CSV_MAX_ROWS = 5_000;
export const STUDENT_CSV_PAGE_SIZE = 50;
export const STUDENT_CSV_HEADERS = [
  'first_name',
  'last_name',
  'preferred_name',
  'grade',
  'school_name',
] as const;
export const STUDENT_CSV_TEMPLATE = `${STUDENT_CSV_HEADERS.join(',')}\r\n`;

const REQUIRED_HEADERS = new Set<string>(['first_name', 'last_name']);
const ALLOWED_HEADERS = new Set<string>(STUDENT_CSV_HEADERS);

export interface StudentCsvImportRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  preferredName: string;
  grade: string;
  schoolName: string;
}

export interface StudentCsvImportIssue {
  rowNumber: number;
  field: string;
  code: string;
  message: string;
}

export interface StudentCsvParseResult {
  rows: StudentCsvImportRow[];
  errors: StudentCsvImportIssue[];
}

function issue(
  rowNumber: number,
  field: string,
  code: string,
  message: string,
): StudentCsvImportIssue {
  return { rowNumber, field, code, message };
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? '').trim() === '');
}

function parserIssue(error: ParseError): StudentCsvImportIssue {
  const rowNumber = typeof error.row === 'number' ? error.row + 1 : 0;
  return issue(rowNumber, 'file', `csv_${error.code.toLowerCase()}`, 'The CSV file is malformed.');
}

export function parseStudentCsvText(text: string): StudentCsvParseResult {
  if (text.trim() === '') {
    return {
      rows: [],
      errors: [issue(0, 'file', 'empty_file', 'Select a CSV file containing student rows.')],
    };
  }

  const parsed = Papa.parse<string[]>(text, {
    delimiter: ',',
    header: false,
    skipEmptyLines: false,
  });
  const errors = parsed.errors.map(parserIssue);
  const records = parsed.data;
  const firstRecord = records[0] ?? [];
  const headers = firstRecord.map((value, index) =>
    String(value ?? '')
      .replace(index === 0 ? /^\uFEFF/ : /$^/, '')
      .trim()
      .toLowerCase(),
  );

  if (headers.length === 0 || headers.every((header) => header === '')) {
    errors.push(issue(1, 'header', 'missing_header', 'The CSV header row is required.'));
    return { rows: [], errors };
  }

  const seenHeaders = new Set<string>();
  for (const header of headers) {
    if (header === '') {
      errors.push(issue(1, 'header', 'blank_header', 'CSV column names cannot be blank.'));
      continue;
    }
    if (seenHeaders.has(header)) {
      errors.push(
        issue(1, header, 'duplicate_header', `The CSV contains the "${header}" column more than once.`),
      );
    }
    seenHeaders.add(header);
    if (!ALLOWED_HEADERS.has(header)) {
      errors.push(
        issue(1, header, 'unknown_header', `The "${header}" column is not supported.`),
      );
    }
  }

  for (const required of REQUIRED_HEADERS) {
    if (!seenHeaders.has(required)) {
      errors.push(
        issue(1, required, 'missing_required_header', `The "${required}" column is required.`),
      );
    }
  }

  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const rows: StudentCsvImportRow[] = [];

  records.slice(1).forEach((record, recordIndex) => {
    const rowNumber = recordIndex + 2;
    if (isBlankRow(record)) return;

    if (record.length !== headers.length) {
      errors.push(
        issue(
          rowNumber,
          'row',
          'column_count',
          `Row ${rowNumber} has ${record.length} columns; expected ${headers.length}.`,
        ),
      );
    }

    const value = (header: string) => {
      const index = headerIndex.get(header);
      return index == null ? '' : String(record[index] ?? '').trim();
    };
    const row: StudentCsvImportRow = {
      rowNumber,
      firstName: value('first_name'),
      lastName: value('last_name'),
      preferredName: value('preferred_name'),
      grade: value('grade'),
      schoolName: value('school_name'),
    };
    rows.push(row);

    if (row.firstName === '') {
      errors.push(
        issue(rowNumber, 'first_name', 'required', `Row ${rowNumber}: first name is required.`),
      );
    } else if (row.firstName.length > 100) {
      errors.push(
        issue(rowNumber, 'first_name', 'too_long', `Row ${rowNumber}: first name is too long.`),
      );
    }
    if (row.lastName === '') {
      errors.push(
        issue(rowNumber, 'last_name', 'required', `Row ${rowNumber}: last name is required.`),
      );
    } else if (row.lastName.length > 100) {
      errors.push(
        issue(rowNumber, 'last_name', 'too_long', `Row ${rowNumber}: last name is too long.`),
      );
    }
    if (row.preferredName.length > 100) {
      errors.push(
        issue(
          rowNumber,
          'preferred_name',
          'too_long',
          `Row ${rowNumber}: preferred name is too long.`,
        ),
      );
    }
    if (row.grade.length > 40) {
      errors.push(issue(rowNumber, 'grade', 'too_long', `Row ${rowNumber}: grade is too long.`));
    }
  });

  if (rows.length === 0) {
    errors.push(issue(0, 'file', 'no_data_rows', 'The CSV does not contain any student rows.'));
  } else if (rows.length > STUDENT_CSV_MAX_ROWS) {
    errors.push(
      issue(
        0,
        'file',
        'row_limit',
        `A CSV can contain at most ${STUDENT_CSV_MAX_ROWS.toLocaleString()} student rows.`,
      ),
    );
  }

  return { rows, errors };
}

export async function parseStudentCsvFile(file: File): Promise<StudentCsvParseResult> {
  if (file.size > STUDENT_CSV_MAX_BYTES) {
    return {
      rows: [],
      errors: [
        issue(0, 'file', 'file_size', 'The CSV file must be 5 MB or smaller.'),
      ],
    };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    return parseStudentCsvText(text);
  } catch {
    return {
      rows: [],
      errors: [
        issue(0, 'file', 'invalid_encoding', 'The CSV file must use UTF-8 encoding.'),
      ],
    };
  }
}
