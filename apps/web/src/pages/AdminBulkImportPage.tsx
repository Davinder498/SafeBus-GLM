import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  stageBulkImport,
  commitBulkImport,
  rollbackBulkImport,
  getBulkImportErrors,
  fetchBulkImportBatches,
  generateBulkInvitations,
  getBulkDeliverySummary,
  fetchBulkInvitationDeliveryRows,
} from '@/services/tenantAdminService';
import { dispatchBulkInvitations, updateInvitation } from '@/services/onboardingService';
import type {
  BulkImportStageResult,
  BulkImportErrorRow,
  BulkImportBatch,
  BulkInvitationDeliveryRow,
} from '@/services/tenantAdminService';

type RecordType = 'student' | 'guardian' | 'driver';

const TEMPLATE_ROWS: Record<RecordType, Record<string, string>> = {
  student: {
    first_name: 'Avery',
    last_name: 'Example',
    preferred_name: '',
    grade: '6',
    school_name: 'Example School',
  },
  guardian: {
    first_name: 'Morgan',
    last_name: 'Example',
    email: 'morgan@example.test',
    phone: '780-555-0100',
  },
  driver: {
    first_name: 'Jordan',
    last_name: 'Example',
    email: 'jordan@example.test',
    phone: '780-555-0101',
    license_number: 'AB-123456',
    license_class: '2',
    license_issue_date: '2025-01-01',
    license_expiry_date: '2030-01-01',
    address_line1: '100 Example Street',
    address_line2: '',
    city: 'Edmonton',
    province: 'AB',
    postal_code: 'T5J 0N3',
  },
};

function downloadTemplate(recordType: RecordType) {
  const blob = new Blob([Papa.unparse([TEMPLATE_ROWS[recordType]])], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `safebus-${recordType}-import-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminBulkImportPage() {
  const [recordType, setRecordType] = useState<RecordType>('guardian');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [staging, setStaging] = useState(false);
  const [stageResult, setStageResult] = useState<BulkImportStageResult | null>(null);
  const [errors, setErrors] = useState<BulkImportErrorRow[]>([]);
  const [batches, setBatches] = useState<BulkImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [commitTarget, setCommitTarget] = useState<string | null>(null);
  const [invitationBatchId, setInvitationBatchId] = useState<string | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<Record<string, number> | null>(null);
  const [deliveryRows, setDeliveryRows] = useState<BulkInvitationDeliveryRow[]>([]);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      setBatches(await fetchBulkImportBatches());
    } catch {
      // Non-fatal — history may not be available if table doesn't exist yet.
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    setStageResult(null);
    setErrors([]);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      complete: (result) => {
        if (result.errors.length > 0) {
          setError(`CSV parse error: ${result.errors[0].message}`);
          return;
        }
        setRows(result.data);
      },
      error: (err) => setError(err.message),
    });
  }

  async function handleStage() {
    if (rows.length === 0) {
      setError('No rows to import. Upload a CSV file first.');
      return;
    }
    setStaging(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await stageBulkImport(recordType, rows, fileName, dryRun);
      setStageResult(result);
      if (result.errorRows > 0) {
        const errorRows = await getBulkImportErrors(result.batchId);
        setErrors(errorRows);
      }
      setSuccess(
        result.dryRun && result.errorRows === 0
          ? `Dry run passed. ${result.validRows} row(s) are valid. Run validation again with dry run disabled to commit.`
          : result.canCommit
          ? `Validation passed. ${result.validRows} row(s) ready to commit.`
          : `Validation found ${result.errorRows} error(s). Review below before committing.`,
      );
      await loadBatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to validate the import.');
    } finally {
      setStaging(false);
    }
  }

  async function handleCommit(batchId: string) {
    setStaging(true);
    setError(null);
    let committed = false;
    try {
      const result = await commitBulkImport(batchId);
      committed = true;
      if (result.requiresInvitations) {
        const queued = await generateBulkInvitations(batchId);
        setInvitationBatchId(batchId);
        const [summary, details] = await Promise.all([
          getBulkDeliverySummary(batchId),
          fetchBulkInvitationDeliveryRows(batchId),
        ]);
        setDeliverySummary(summary);
        setDeliveryRows(details);
        setSuccess(
          `Committed ${result.committed} onboarding row(s). ${queued.totalInvitations} invitation(s) are queued for rate-limited delivery.`,
        );
      } else {
        setSuccess(`Committed ${result.committed} student record(s).`);
      }
      setCommitTarget(null);
      setStageResult(null);
      setErrors([]);
      setRows([]);
      setFileName('');
      await loadBatches();
    } catch (e) {
      if (committed) {
        setCommitTarget(null);
        setStageResult(null);
        setErrors([]);
        setRows([]);
        setFileName('');
        await loadBatches();
      }
      setError(
        committed
          ? 'The import was committed, but invitations could not be queued. Use Queue / review in Recent imports to retry safely.'
          : e instanceof Error
            ? e.message
            : 'Unable to commit the import.',
      );
    } finally {
      setStaging(false);
    }
  }

  async function handleDispatch(batchId: string) {
    setStaging(true);
    setError(null);
    try {
      const result = await dispatchBulkInvitations(batchId, 10);
      setInvitationBatchId(batchId);
      setDeliverySummary(result.summary);
      setDeliveryRows(await fetchBulkInvitationDeliveryRows(batchId));
      setSuccess(
        result.claimed === 0
          ? 'No queued invitations are ready for delivery.'
          : `Invitation delivery processed ${result.claimed} row(s): ${result.sent} sent, ${result.failed} failed.`,
      );
      await loadBatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to dispatch invitations.');
    } finally {
      setStaging(false);
    }
  }

  async function reviewDelivery(batchId: string) {
    setError(null);
    try {
      setInvitationBatchId(batchId);
      const [summary, details] = await Promise.all([
        getBulkDeliverySummary(batchId),
        fetchBulkInvitationDeliveryRows(batchId),
      ]);
      setDeliverySummary(summary);
      setDeliveryRows(details);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load invitation delivery status.');
    }
  }

  async function queueAndReviewDelivery(batchId: string) {
    setStaging(true);
    setError(null);
    try {
      await generateBulkInvitations(batchId);
      const [summary, details] = await Promise.all([
        getBulkDeliverySummary(batchId),
        fetchBulkInvitationDeliveryRows(batchId),
      ]);
      setInvitationBatchId(batchId);
      setDeliverySummary(summary);
      setDeliveryRows(details);
      setSuccess('Invitation queue is ready for rate-limited delivery.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to prepare the invitation queue.');
    } finally {
      setStaging(false);
    }
  }

  async function revokeBulkInvitation(invitationId: string) {
    if (!invitationBatchId) return;
    setStaging(true);
    setError(null);
    try {
      await updateInvitation(invitationId, 'revoke');
      await reviewDelivery(invitationBatchId);
      setSuccess('Invitation revoked and sign-in disabled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to revoke the invitation.');
    } finally {
      setStaging(false);
    }
  }

  async function handleRollback(batchId: string) {
    try {
      await rollbackBulkImport(batchId);
      setStageResult(null);
      setErrors([]);
      setSuccess('Import rolled back. No records were created.');
      await loadBatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to roll back.');
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Bulk onboarding"
          title="Secure bulk import"
          description="Validate students, guardians, or drivers from a CSV before committing any records. Duplicate and conflicting identifiers are detected before anything is written."
        />

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <p className="text-sm font-semibold text-danger-700">{error}</p>
          </Card>
        )}
        {success && (
          <Card className="border-success-200 bg-success-50 p-4" role="status">
            <p className="text-sm font-semibold text-success-700">{success}</p>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-lg font-bold text-navy-900">Upload and validate</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="record-type">
                Record type
              </label>
              <select
                id="record-type"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as RecordType)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
              >
                <option value="guardian">Guardians</option>
                <option value="driver">Drivers</option>
                <option value="student">Students</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => downloadTemplate(recordType)}
              >
                Download CSV template
              </Button>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700" htmlFor="csv-file">
                CSV file
              </label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="mt-2 w-full text-sm"
              />
              {fileName && (
                <p className="mt-1 text-sm text-slate-600">
                  {fileName} — {rows.length} row(s) parsed
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              id="dry-run"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="dry-run" className="text-sm font-semibold text-gray-700">
              Dry run (validate only, do not commit)
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={handleStage} loading={staging} disabled={rows.length === 0}>
              Validate {dryRun ? '(dry run)' : 'and stage'}
            </Button>
          </div>
        </Card>

        {stageResult && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Validation results</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-2xl font-bold text-navy-900">{stageResult.totalRows}</p>
                <p className="text-sm text-gray-600">Total rows</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success-700">{stageResult.validRows}</p>
                <p className="text-sm text-gray-600">Valid rows</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-danger-700">{stageResult.errorRows}</p>
                <p className="text-sm text-gray-600">Error rows</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-navy-900">{stageResult.canCommit ? 'Yes' : 'No'}</p>
                <p className="text-sm text-gray-600">Can commit</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {stageResult.canCommit && !dryRun && (
                <Button type="button" onClick={() => setCommitTarget(stageResult.batchId)}>
                  Commit {stageResult.validRows} record(s)
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => handleRollback(stageResult.batchId)}>
                Discard / Roll back
              </Button>
            </div>
          </Card>
        )}

        {errors.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-lg font-bold text-danger-800">Validation errors</h2>
              <p className="mt-1 text-sm text-slate-600">
                Fix these rows in your CSV and re-upload. No records are committed when errors exist.
              </p>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {errors.map((row) => (
                    <tr key={row.row_number}>
                      <td className="px-4 py-3 font-semibold text-navy-900">{row.row_number}</td>
                      <td className="px-4 py-3 text-danger-700">
                        {Array.isArray(row.validation_errors)
                          ? row.validation_errors.join('; ')
                          : JSON.stringify(row.validation_errors)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {invitationBatchId && deliverySummary && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Invitation delivery</h2>
            <p className="mt-1 text-sm text-slate-600">
              Invitations contain guardian or driver account details only. Student information is never included.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {['total', 'queued', 'processing', 'sent', 'failed', 'revoked'].map((key) => (
                <div key={key} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xl font-bold text-navy-900">{deliverySummary[key] ?? 0}</p>
                  <p className="text-xs font-semibold uppercase text-slate-500">{key}</p>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="mt-4"
              loading={staging}
              onClick={() => void handleDispatch(invitationBatchId)}
            >
              Send next 10 invitations
            </Button>
            {deliveryRows.length > 0 && (
              <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Recipient</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Attempts</th>
                      <th className="px-3 py-2">Last error</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveryRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-navy-900">{row.full_name}</p>
                          <p className="text-xs text-slate-600">{row.email}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.status} · {row.delivery_status}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.delivery_attempts}</td>
                        <td className="max-w-xs px-3 py-2 text-xs text-danger-700">
                          {row.last_delivery_error ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {['queued', 'pending', 'resent', 'failed'].includes(row.status) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              disabled={staging}
                              onClick={() => void revokeBulkInvitation(row.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-lg font-bold text-navy-900">Recent imports</h2>
          {loadingBatches ? (
            <DataState title="Loading import history" message="Fetching recent batches." />
          ) : batches.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No imports yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Invitations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(batch.created_at).toLocaleDateString('en-CA')}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">{batch.record_type}</td>
                      <td className="px-4 py-3 text-slate-700">{batch.file_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            batch.status === 'committed'
                              ? 'bg-success-50 text-success-700'
                              : batch.status === 'rolled_back'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-warning-50 text-warning-700'
                          }`}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {batch.valid_rows} valid / {batch.total_rows} total
                      </td>
                      <td className="px-4 py-3">
                        {batch.status === 'committed' && batch.record_type !== 'student' ? (
                          <Button type="button" size="sm" variant="secondary" onClick={() => void queueAndReviewDelivery(batch.id)}>
                            Queue / review
                          </Button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ConfirmDialog
          open={!!commitTarget}
          title="Commit this import?"
          description="This will create the validated records in the live database. Make sure you have reviewed all rows."
          confirmLabel="Commit records"
          busy={staging}
          onConfirm={() => commitTarget && void handleCommit(commitTarget)}
          onCancel={() => setCommitTarget(null)}
        />
      </div>
    </DashboardLayout>
  );
}
