import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  commitStudentCsvImport,
  previewStudentCsvImport,
  type StudentCsvImportResult,
} from '@/services/studentCsvImportService';
import {
  STUDENT_CSV_PAGE_SIZE,
  STUDENT_CSV_TEMPLATE,
  parseStudentCsvFile,
  type StudentCsvImportIssue,
  type StudentCsvImportRow,
} from '@/utils/studentCsv';

function issueRows(issues: StudentCsvImportIssue[]) {
  return new Set(issues.filter((issue) => issue.rowNumber > 0).map((issue) => issue.rowNumber));
}

function downloadTemplate() {
  const blob = new Blob([`\uFEFF${STUDENT_CSV_TEMPLATE}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'safebus-student-import-template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: StudentCsvImportIssue[];
  tone: 'error' | 'warning';
}) {
  if (issues.length === 0) return null;
  const isError = tone === 'error';
  return (
    <section
      className={`rounded-lg border p-4 ${
        isError ? 'border-danger-200 bg-danger-50' : 'border-amber-200 bg-amber-50'
      }`}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            isError ? 'text-danger-700' : 'text-amber-700'
          }`}
          aria-hidden
        />
        <div className="min-w-0">
          <h3
            className={`text-sm font-bold ${
              isError ? 'text-danger-800' : 'text-amber-900'
            }`}
          >
            {title}
          </h3>
          <ul
            className={`mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm ${
              isError ? 'text-danger-700' : 'text-amber-800'
            }`}
          >
            {issues.slice(0, 100).map((item, index) => (
              <li key={`${item.rowNumber}-${item.field}-${item.code}-${index}`}>{item.message}</li>
            ))}
          </ul>
          {issues.length > 100 && (
            <p className="mt-2 text-xs font-semibold">
              Showing the first 100 of {issues.length.toLocaleString()} issues.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function StudentCsvImportPanel({
  onImported,
  onCancel,
}: {
  onImported: (count: number) => Promise<void>;
  onCancel: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<StudentCsvImportRow[]>([]);
  const [localErrors, setLocalErrors] = useState<StudentCsvImportIssue[]>([]);
  const [result, setResult] = useState<StudentCsvImportResult | null>(null);
  const [working, setWorking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [page, setPage] = useState(1);

  const errors = useMemo(
    () => [...localErrors, ...(result?.errors ?? [])],
    [localErrors, result?.errors],
  );
  const warnings = useMemo(() => result?.warnings ?? [], [result?.warnings]);
  const issueRowNumbers = useMemo(
    () => issueRows([...errors, ...warnings]),
    [errors, warnings],
  );
  const visibleRows = issuesOnly
    ? rows.filter((row) => issueRowNumbers.has(row.rowNumber))
    : rows;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / STUDENT_CSV_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice(
    (currentPage - 1) * STUDENT_CSV_PAGE_SIZE,
    currentPage * STUDENT_CSV_PAGE_SIZE,
  );
  const canImport =
    rows.length > 0
    && errors.length === 0
    && !working
    && !committing
    && (warnings.length === 0 || acknowledgedWarnings);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setWorking(true);
    setRows([]);
    setLocalErrors([]);
    setResult(null);
    setRequestError(null);
    setIssuesOnly(false);
    setAcknowledgedWarnings(false);
    setPage(1);

    try {
      const parsed = await parseStudentCsvFile(file);
      setRows(parsed.rows);
      setLocalErrors(parsed.errors);
      if (parsed.errors.length === 0) {
        setResult(await previewStudentCsvImport(parsed.rows));
      }
    } catch {
      setRequestError('The CSV file could not be read. Select it again.');
    } finally {
      setWorking(false);
    }
  }

  async function handleImport() {
    if (!canImport) return;
    setCommitting(true);
    setRequestError(null);
    try {
      const committed = await commitStudentCsvImport(rows, acknowledgedWarnings);
      setResult(committed);
      if (committed.errors.length > 0) {
        setPage(1);
        return;
      }
      if (committed.importedCount !== rows.length) {
        setRequestError('The import did not return the expected student count. No retry was started.');
        return;
      }
      await onImported(committed.importedCount);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'The students could not be imported.');
    } finally {
      setCommitting(false);
    }
  }

  function resetFile() {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setRows([]);
    setLocalErrors([]);
    setResult(null);
    setRequestError(null);
    setIssuesOnly(false);
    setAcknowledgedWarnings(false);
    setPage(1);
  }

  return (
    <Card className="space-y-5 p-5" data-testid="student-csv-import">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-navy-700" aria-hidden />
            <h2 className="text-lg font-bold text-navy-900">Import students from CSV</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Import up to 5,000 active students. Required columns are first_name and
            last_name. preferred_name, grade, and school_name are optional.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          leftIcon={<Download className="h-4 w-4" aria-hidden />}
          onClick={downloadTemplate}
        >
          Download template
        </Button>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-csv-file">
          Student CSV file
        </label>
        <input
          ref={fileInputRef}
          id="student-csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void handleFileChange(event)}
          disabled={working || committing}
          className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-navy-100 file:px-4 file:py-2 file:font-semibold file:text-navy-800 hover:file:bg-navy-200"
        />
        <p className="mt-2 text-xs text-gray-500">
          UTF-8 CSV only, maximum 5 MB. The file is validated before any students are saved.
        </p>
      </div>

      {working && (
        <p className="text-sm font-semibold text-navy-700" role="status">
          Validating CSV…
        </p>
      )}
      {requestError && (
        <p className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm font-semibold text-danger-700">
          {requestError}
        </p>
      )}

      <IssueList
        title={`${errors.length.toLocaleString()} error${errors.length === 1 ? '' : 's'} must be fixed`}
        issues={errors}
        tone="error"
      />
      <IssueList
        title={`${warnings.length.toLocaleString()} possible duplicate warning${warnings.length === 1 ? '' : 's'}`}
        issues={warnings}
        tone="warning"
      />

      {rows.length > 0 && (
        <section className="space-y-3" aria-labelledby="student-csv-preview-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="student-csv-preview-title" className="font-bold text-navy-900">
                Preview {rows.length.toLocaleString()} students
              </h3>
              <p className="text-sm text-gray-600">
                Every valid row will create a new active student.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={issuesOnly}
                onChange={(event) => {
                  setIssuesOnly(event.target.checked);
                  setPage(1);
                }}
              />
              Show issues only
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Preferred name</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((row) => {
                  const rowHasError = errors.some((item) => item.rowNumber === row.rowNumber);
                  const rowHasWarning = warnings.some((item) => item.rowNumber === row.rowNumber);
                  return (
                    <tr key={row.rowNumber}>
                      <td className="px-4 py-3 font-semibold text-slate-600">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-semibold text-navy-900">
                        {row.firstName || 'Missing'} {row.lastName || 'Missing'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.preferredName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.grade || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.schoolName || 'Not assigned'}
                      </td>
                      <td className="px-4 py-3">
                        {rowHasError ? (
                          <span className="font-semibold text-danger-700">Error</span>
                        ) : rowHasWarning ? (
                          <span className="font-semibold text-amber-700">Warning</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-success-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pageRows.length === 0 && (
              <p className="p-4 text-sm text-gray-600">No rows match this filter.</p>
            )}
          </div>

          {visibleRows.length > 0 && (
            <div
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="student-csv-pagination"
            >
              <p className="text-sm text-gray-600">
                Showing {(currentPage - 1) * STUDENT_CSV_PAGE_SIZE + 1}-
                {Math.min(currentPage * STUDENT_CSV_PAGE_SIZE, visibleRows.length)} of{' '}
                {visibleRows.length.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          <input
            className="mt-0.5"
            type="checkbox"
            checked={acknowledgedWarnings}
            onChange={(event) => setAcknowledgedWarnings(event.target.checked)}
          />
          I reviewed the possible duplicates and understand that every row will create a new
          student.
        </label>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          leftIcon={<Upload className="h-4 w-4" aria-hidden />}
          loading={committing}
          disabled={!canImport}
          onClick={() => void handleImport()}
        >
          Import {rows.length > 0 ? rows.length.toLocaleString() : ''} students
        </Button>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={working || committing}
            onClick={resetFile}
          >
            Clear file
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={working || committing}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
