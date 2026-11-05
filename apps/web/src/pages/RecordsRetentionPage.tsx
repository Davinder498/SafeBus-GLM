import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  DashboardLayout,
  adminNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { RecordsRequestForm } from '@/components/admin/RecordsRequestForm';
import { BusinessRecordsPanel } from '@/components/admin/BusinessRecordsPanel';
import { RetentionPanel } from '@/components/admin/RetentionPanel';
import { useAuth } from '@/contexts/useAuth';
import {
  getRetentionOverview,
  getExportChunks,
  recordsRequest,
  saveJson,
  type RetentionOverview,
  type RecordHold,
  type RecordExport,
  type ExportChunk,
} from '@/services/recordsRetentionService';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-navy-900';
const time = (value: string) => formatAdminTripTimestamp(value);
function ExportDownloads({
  job,
  onError,
}: {
  job: RecordExport;
  onError: (message: string) => void;
}) {
  const [chunks, setChunks] = useState<ExportChunk[]>([]);
  const [busy, setBusy] = useState(false);
  async function load(older = false) {
    setBusy(true);
    try {
      const next = await getExportChunks(job.id, older ? chunks.at(-1) : undefined);
      setChunks(older ? [...chunks, ...next] : next);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Unable to load export chunks.');
    } finally {
      setBusy(false);
    }
  }
  async function download(chunk: ExportChunk) {
    setBusy(true);
    try {
      const value = await recordsRequest('export_access', { id: job.id, chunkId: chunk.id });
      saveJson(value, `safebus-${job.reference.replace(/[^A-Za-z0-9._-]/g, '-')}-${chunk.id}.json`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Unable to download records.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>
        View download chunks
      </Button>
      {chunks.length > 0 && (
        <>
          <p className="text-sm">
            Download every chunk for a complete export. Files contain sensitive records; keep them
            only in an approved records system. The export is complete only when its state is Ready.
          </p>
          <div className="flex flex-wrap gap-2">
            {chunks.map((c, i) => (
              <Button key={c.id} variant="outline" disabled={busy} onClick={() => void download(c)}>
                Download chunk {i + 1} ({c.row_count} records)
              </Button>
            ))}
          </div>
          {chunks.length % 50 === 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => void load(true)}>
              More chunks
            </Button>
          )}
        </>
      )}
    </div>
  );
}
export function RecordsRetentionPage() {
  const { profile } = useAuth();
  const platform = profile?.role === 'platform_super_admin';
  const permitted =
    !!profile &&
    ['tenant_admin', 'transportation_admin', 'platform_super_admin'].includes(profile.role);
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<RecordHold | null>(null);
  const [releasing, setReleasing] = useState<RecordHold | null>(null);
  const [exportConfirmation, setExportConfirmation] = useState<{
    job: RecordExport;
    kind: 'approve' | 'cancel';
  } | null>(null);
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!permitted) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setOverview(await getRetentionOverview(cursor));
    } catch (cause) {
      setOverview(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load records management.');
    } finally {
      setLoading(false);
    }
  }, [permitted, cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: string, data: Record<string, unknown>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await recordsRequest(name, data);
      setReleasing(null);
      setReviewing(null);
      setExportConfirmation(null);
      setNotice(message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save records request.');
    } finally {
      setBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) return;
    const values = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {
      id: reviewing.id,
      reviewAt: new Date(String(values.get('reviewAt'))).toISOString(),
    };
    if (values.get('minimumUntil'))
      data.minimumUntil = new Date(String(values.get('minimumUntil'))).toISOString();
    if (values.get('decisionUsedAt'))
      data.decisionUsedAt = new Date(String(values.get('decisionUsedAt'))).toISOString();
    await action('hold_review', data, 'Review saved. Preservation remains active.');
  }
  const scopeLabel = (r: {
    record_id: string | null;
    window_start: string | null;
    window_end: string | null;
  }) =>
    r.record_id
      ? `Single record: ${r.record_id}`
      : r.window_start && r.window_end
        ? `Recorded ${time(r.window_start)} to ${time(r.window_end)}`
        : 'Entire data class';
  const label = (key: string) =>
    overview?.rules.find((r) => r.data_class === key)?.label || key.replaceAll('_', ' ');
  if (!permitted)
    return (
      <DataState
        title="Records access unavailable"
        message="An authorized administrator account is required."
      />
    );
  return (
    <DashboardLayout
      title="Records and disposal"
      portal="admin"
      navItems={[]}
      navGroups={platform ? platformNavGroups : adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow={platform ? 'Platform administration' : 'School authority administration'}
          title="Records and disposal"
          action={
            <Button variant="secondary" disabled={busy || loading} onClick={() => void load()}>
              Refresh records
            </Button>
          }
        />
        {!platform && <AdminSettingsNav role={profile?.role} />}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-4 text-danger-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-navy-50 p-4">
            {notice}
          </p>
        )}
        {loading && !overview && (
          <DataState title="Loading retention" message="Checking policies and records requests." />
        )}
        {overview && (
          <>
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Automatic disposal</h2>
                <p className="font-semibold">
                  {overview.automaticDisposalEnabled &&
                  overview.executionRequested &&
                  overview.workerConfigured
                    ? 'Enabled'
                    : 'Paused'}
                </p>
              </div>
              <p className="text-sm">
                Records expire when their approved trigger and period are met. Active operations,
                required dependencies, preservation and mandatory minimums take priority. A review
                date never releases preserved records.
              </p>
              {platform && overview.execution && (
                <>
                  <p className="text-sm">
                    Latest recorded execution: {time(overview.execution.completedAt)} ·{' '}
                    {overview.execution.runCount} batches in that hourly window
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(overview.execution.counts)
                      .filter(([, n]) => n > 0)
                      .map(([key, n]) => (
                        <div key={key}>
                          <dt className="text-sm text-gray-600">{label(key)}</dt>
                          <dd className="font-semibold">{n}</dd>
                        </div>
                      ))}
                  </dl>
                </>
              )}
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="text-xl font-bold">Retention schedule</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Approved class-specific disposal rules</caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="p-3">Data class</th>
                      <th className="p-3">Period</th>
                      <th className="p-3">Trigger and method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rules.map((rule) => (
                      <tr key={rule.data_class} className="border-b border-gray-100">
                        <th scope="row" className="p-3 font-semibold">
                          {rule.label}
                        </th>
                        <td className="p-3">
                          {rule.days
                            ? `${rule.days} days`
                            : rule.method === 'calendar'
                              ? '6 calendar years'
                              : 'Case / provider-specific'}
                        </td>
                        <td className="p-3">{rule.trigger_description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Preservation requests</h2>
                <Button disabled={busy || creating} onClick={() => setCreating(true)}>
                  Request preservation or download
                </Button>
              </div>
              {creating && (
                <RecordsRequestForm
                  rules={overview.rules}
                  platform={platform}
                  onCancel={() => setCreating(false)}
                  onSaved={() => {
                    setCreating(false);
                    setNotice(
                      'Records request saved. Preservation takes effect immediately; platform downloads of authority records need authority approval.',
                    );
                    void load();
                  }}
                />
              )}
              {overview.holds.length === 0 && <p>No preservation requests.</p>}
              {overview.holds.map((hold) => (
                <div key={hold.id} className="space-y-2 rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold">
                    {hold.reference} · {label(hold.data_class)} · {hold.state}
                  </p>
                  <p className="break-words text-sm">{scopeLabel(hold)}</p>
                  <p className="text-sm">
                    Minimum: {time(hold.minimum_until)} · Review: {time(hold.review_at)}
                    {hold.state !== 'released' && Date.parse(hold.review_at) <= Date.now()
                      ? ' · Review due'
                      : ''}
                  </p>
                  {hold.state === 'requested' && (
                    <p className="text-sm">Protected while the authority reviews the request.</p>
                  )}
                  {hold.state !== 'released' && (
                    <div className="flex flex-wrap gap-2">
                      {!platform &&
                        profile?.role === 'tenant_admin' &&
                        hold.state === 'requested' && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void action(
                                'hold_approve',
                                { id: hold.id },
                                'Preservation request approved.',
                              )
                            }
                          >
                            Approve preservation request
                          </Button>
                        )}
                      <Button
                        variant="secondary"
                        disabled={busy || !!reviewing || !!releasing}
                        onClick={() => setReviewing(hold)}
                      >
                        Review / extend
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          busy ||
                          !!reviewing ||
                          !!releasing ||
                          Date.parse(hold.minimum_until) > Date.now()
                        }
                        onClick={() => {
                          setReleasing(hold);
                          setConfirmed(false);
                        }}
                      >
                        Release preservation
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !cursor.holdBefore}
                  onClick={() =>
                    setCursor((c) => {
                      const next = { ...c };
                      delete next.holdBefore;
                      delete next.holdBeforeId;
                      return next;
                    })
                  }
                >
                  Newest preservation requests
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || overview.holds.length < 50}
                  onClick={() => {
                    const h = overview.holds.at(-1);
                    if (h)
                      setCursor((c) => ({ ...c, holdBefore: h.created_at, holdBeforeId: h.id }));
                  }}
                >
                  Older preservation requests
                </Button>
              </div>
              {reviewing && (
                <form
                  onSubmit={(e) => void review(e)}
                  className="space-y-3 rounded-lg border border-navy-200 p-4"
                >
                  <h3 className="font-bold">Review {reviewing.reference}</h3>
                  <label className="block">
                    Next review
                    <input className={input} type="datetime-local" name="reviewAt" required />
                  </label>
                  <label className="block">
                    Extend minimum retention until
                    <input className={input} type="datetime-local" name="minimumUntil" />
                  </label>
                  <label className="block">
                    Decision used at (if applicable)
                    <input className={input} type="datetime-local" name="decisionUsedAt" />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" loading={busy}>
                      Save review
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setReviewing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              {releasing && (
                <div className="space-y-3 rounded-lg border border-danger-200 p-4">
                  <h3 className="font-bold">Release {releasing.reference}</h3>
                  <p>
                    Records eligible under the schedule can be permanently disposed of after
                    release. Other preservation requests and minimums still apply.
                  </p>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I verified that the preservation purpose and mandatory requirements permit
                    release.
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      disabled={!confirmed}
                      loading={busy}
                      onClick={() =>
                        void action(
                          'hold_release',
                          { id: releasing.id, confirm: 'release' },
                          'Preservation released. Normal retention and remaining holds still apply.',
                        )
                      }
                    >
                      Confirm release
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setReleasing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="text-xl font-bold">Record downloads</h2>
              {overview.exports.length === 0 && <p>No download requests.</p>}
              {overview.exports.map((job) => (
                <div key={job.id} className="space-y-3 rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold">
                    {job.reference} · {label(job.data_class)} · {job.state}
                  </p>
                  <p className="break-words text-sm">{scopeLabel(job)}</p>
                  <p className="text-sm">
                    Prepared records: {job.row_count} · Server copy expires: {time(job.expires_at)}
                  </p>
                  {job.state === 'requested' && (
                    <p className="text-sm">
                      Awaiting school authority approval. No customer records are available to the
                      platform requester.
                    </p>
                  )}
                  {job.state === 'requested' && !platform && profile?.role === 'tenant_admin' && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setExportConfirmation({ job, kind: 'approve' });
                        setExportConfirmed(false);
                      }}
                    >
                      Approve scoped download
                    </Button>
                  )}
                  {['running', 'ready'].includes(job.state) && (
                    <ExportDownloads job={job} onError={setError} />
                  )}
                  {!['cancelled', 'expired'].includes(job.state) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setExportConfirmation({ job, kind: 'cancel' });
                        setExportConfirmed(false);
                      }}
                    >
                      Cancel / remove server copy
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !cursor.exportBefore}
                  onClick={() =>
                    setCursor((c) => {
                      const next = { ...c };
                      delete next.exportBefore;
                      delete next.exportBeforeId;
                      return next;
                    })
                  }
                >
                  Newest downloads
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || overview.exports.length < 50}
                  onClick={() => {
                    const e = overview.exports.at(-1);
                    if (e)
                      setCursor((c) => ({
                        ...c,
                        exportBefore: e.created_at,
                        exportBeforeId: e.id,
                      }));
                  }}
                >
                  Older downloads
                </Button>
              </div>
            </Card>
            {exportConfirmation && (
              <Card className="space-y-3 border-danger-200 p-5">
                <h2 className="text-xl font-bold">
                  {exportConfirmation.kind === 'approve'
                    ? 'Approve scoped download'
                    : 'Cancel and remove export'}
                </h2>
                <p>
                  {exportConfirmation.job.reference} · {label(exportConfirmation.job.data_class)}
                </p>
                <p className="break-words">{scopeLabel(exportConfirmation.job)}</p>
                <p>
                  {exportConfirmation.kind === 'approve'
                    ? 'This grants the requester access to the selected records for a 30-day download window. Verify the scope and requester’s authority before approving.'
                    : 'Download access stops immediately. Server copies are queued for disposal. Source records already outside routine retention may also expire unless another preservation request protects them.'}
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={exportConfirmed}
                    onChange={(e) => setExportConfirmed(e.target.checked)}
                  />
                  I reviewed the scope and consequences.
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={exportConfirmation.kind === 'cancel' ? 'danger' : 'primary'}
                    loading={busy}
                    disabled={!exportConfirmed}
                    onClick={() =>
                      void action(
                        exportConfirmation.kind === 'approve' ? 'export_approve' : 'export_cancel',
                        {
                          id: exportConfirmation.job.id,
                          confirm:
                            exportConfirmation.kind === 'approve'
                              ? 'approve_export'
                              : 'cancel_export',
                        },
                        exportConfirmation.kind === 'approve'
                          ? 'Scoped download approved.'
                          : 'Export cancelled; server copy removal is queued.',
                      )
                    }
                  >
                    Confirm {exportConfirmation.kind === 'approve' ? 'approval' : 'cancellation'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setExportConfirmation(null)}
                  >
                    Keep current state
                  </Button>
                </div>
              </Card>
            )}
            {!platform && <RetentionPanel />}
            {platform && <BusinessRecordsPanel rules={overview.rules} />}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
