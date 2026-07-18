import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  StudentCsvImportIssue,
  StudentCsvImportRow,
} from '@/utils/studentCsv';

export interface StudentCsvImportResult {
  rowCount: number;
  importedCount: number;
  errors: StudentCsvImportIssue[];
  warnings: StudentCsvImportIssue[];
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

function safeResult(value: unknown): StudentCsvImportResult {
  const result = (value ?? {}) as Partial<StudentCsvImportResult>;
  return {
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : 0,
    importedCount: typeof result.importedCount === 'number' ? result.importedCount : 0,
    errors: Array.isArray(result.errors) ? result.errors : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

async function processStudentCsvImport(
  rows: StudentCsvImportRow[],
  commit: boolean,
  acknowledgeWarnings: boolean,
): Promise<StudentCsvImportResult> {
  const { data, error } = await client().rpc('admin_process_student_csv_import', {
    p_rows: rows,
    p_commit: commit,
    p_acknowledge_warnings: acknowledgeWarnings,
  });

  if (error) {
    if ((error.message ?? '').includes('Only a tenant administrator')) {
      throw new Error('Only a tenant administrator can import student CSV files.');
    }
    throw new Error(
      commit
        ? 'The students could not be imported. No student rows were saved.'
        : 'The CSV could not be validated. Try again.',
    );
  }

  return safeResult(data);
}

export function previewStudentCsvImport(
  rows: StudentCsvImportRow[],
): Promise<StudentCsvImportResult> {
  return processStudentCsvImport(rows, false, false);
}

export function commitStudentCsvImport(
  rows: StudentCsvImportRow[],
  acknowledgeWarnings: boolean,
): Promise<StudentCsvImportResult> {
  return processStudentCsvImport(rows, true, acknowledgeWarnings);
}
