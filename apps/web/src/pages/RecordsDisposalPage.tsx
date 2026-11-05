import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import {
  DashboardLayout,
  adminNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  disposalAction,
  fetchDisposalStatus,
  fetchDisposalHolds,
  fetchDisposalCandidates,
  type DisposalStatus,
  type DisposalHold,
  type DisposalCandidate,
} from '@/services/disposalService';
const policies: Record<string, string> = {
  student_records: 'Students',
  guardian_relationships: 'Guardian links',
  driver_records: 'Drivers',
  guardian_records: 'Guardians',
  invitations: 'Invitations',
  trip_records: 'Trips',
  bus_run_dispatches: 'Dispatches',
  bus_tracking_sessions: 'Ended tracking sessions',
  announcements: 'Announcements',
  accounts: 'Closed accounts',
};
const limited = ['trip_records', 'bus_run_dispatches', 'bus_tracking_sessions', 'announcements'];
const field = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-navy-900';
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Records disposal is unavailable.';
export function RecordsDisposalPage() {
  const { profile } = useAuth();
  return <DisposalWorkspace key={`${profile?.id}:${profile?.tenant_id}:${profile?.role}`} />;
}
function DisposalWorkspace() {
  const { profile } = useAuth();
  const platform = profile?.role === 'platform_super_admin';
  const operational = profile?.role === 'transportation_admin';
  const permitted =
    !!profile &&
    ['tenant_admin', 'transportation_admin', 'platform_super_admin'].includes(profile.role);
  const [status, setStatus] = useState<DisposalStatus | null>(null);
  const [holds, setHolds] = useState<DisposalHold[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(operational ? 'trip_records' : 'student_records');
  const [records, setRecords] = useState<DisposalCandidate[]>([]);
  const [recordId, setRecordId] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [editing, setEditing] = useState<DisposalHold | null>(null);
  const [release, setRelease] = useState<DisposalHold | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setError('');
    try {
      const next = await fetchDisposalStatus();
      const list = platform ? [] : await fetchDisposalHolds(cursor);
      setStatus(next);
      setHolds(list);
    } catch (e) {
      setStatus(null);
      setHolds([]);
      setRecords([]);
      setRecordId('');
      setError(errorMessage(e));
    }
  }, [platform, cursor]);
  useEffect(() => {
    if (permitted) void load();
  }, [load, permitted]);
  useEffect(() => {
    if (operational) setPolicy('trip_records');
  }, [operational]);
  const canManage = !platform && permitted && status !== null;
  useEffect(() => {
    let active = true;
    setRecords([]);
    setRecordId('');
    if (!canManage) return;
    setLoadingRecords(true);
    void fetchDisposalCandidates(policy)
      .then((r) => {
        if (active) setRecords(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoadingRecords(false);
      });
    return () => {
      active = false;
    };
  }, [policy, canManage]);
  async function mutate(action: string, data: Record<string, string>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await disposalAction(action, data);
      setEditing(null);
      setRelease(null);
      setConfirmed(false);
      setNotice('Saved. Preservation remains until explicitly released.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const values: Record<string, string> = {
      policy,
      reference: String(f.get('reference')),
      reviewAt: new Date(String(f.get('reviewAt'))).toISOString(),
    };
    for (const key of ['minimumUntil', 'decisionUsedAt'])
      if (f.get(key)) values[key] = new Date(String(f.get(key))).toISOString();
    if (editing) values.id = editing.id;
    else values.recordId = recordId;
    await mutate(editing ? 'review' : 'preserve', values);
  }
  function saveFile(result: unknown, filename: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function download() {
    setBusy(true);
    setError('');
    try {
      const result = await disposalAction('export', { policy, recordId });
      saveFile(result, 'safebus-record.json');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!permitted) return null;
  return (
    <DashboardLayout
      title="Records disposal"
      portal="admin"
      navItems={[]}
      navGroups={platform ? platformNavGroups : adminNavGroups}
    >
      <div className="space-y-5">
        <PageHeader
          title="Records disposal"
          description={
            platform
              ? 'Review aggregate disposal activity.'
              : 'Review automatic disposal and preserve records when needed.'
          }
          action={
            <Button disabled={busy} variant="secondary" onClick={() => void load()}>
              Refresh disposal
            </Button>
          }
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-4 text-danger-700">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {status && (
          <Card className="space-y-4 p-5">
            <h2 className="text-xl font-bold">Automatic disposal</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt>Execution</dt>
                <dd>{status.enabled ? 'Database enabled' : 'Not activated'}</dd>
              </div>
              <div>
                <dt>Last recorded disposal</dt>
                <dd>
                  {status.lastRun
                    ? new Date(status.lastRun).toLocaleString()
                    : 'No execution recorded'}
                </dd>
              </div>
              <div>
                <dt>Preservation reviews due</dt>
                <dd>{status.reviewDue}</dd>
              </div>
            </dl>
            <p className="text-sm">
              {status.activeHolds} active record preservation requests. Trip GPS archives have their
              own scoped preservation controls.
            </p>
            {platform ? (
              <Button
                variant="secondary"
                onClick={() => saveFile(status, 'safebus-disposal-summary.json')}
              >
                Download disposal summary
              </Button>
            ) : (
              <Link className="font-semibold text-navy-700 underline" to="/admin/trips">
                View trips and GPS archives
              </Link>
            )}
            {status.totals.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <caption className="text-left font-semibold">
                    Disposed or minimized in the last 30 days
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Records</th>
                      <th scope="col">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.totals.map((t) => (
                      <tr key={t.policy_key}>
                        <td>{policies[t.policy_key] || t.policy_key.replaceAll('_', ' ')}</td>
                        <td>{t.disposed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm">{status.pendingAccounts} closed account disposals pending.</p>
            <p className="text-sm">
              Primary database and Auth removal are recorded separately from supplier copies and
              backup expiry.
            </p>
          </Card>
        )}
        {canManage && (
          <>
            <Card className="space-y-4 p-5">
              <h2 className="text-xl font-bold">Preserve or download a record</h2>
              <label className="block">
                Record type
                <select
                  className={field}
                  value={policy}
                  onChange={(e) => {
                    setPolicy(e.target.value);
                    setEditing(null);
                  }}
                  disabled={busy}
                >
                  {Object.entries(policies)
                    .filter(([key]) => !operational || limited.includes(key))
                    .map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Record
                <select
                  className={field}
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  disabled={busy || loadingRecords}
                >
                  <option value="">
                    {loadingRecords ? 'Loading records…' : 'Choose a record'}
                  </option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                      {r.status ? ` · ${r.status}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  disabled={busy || records.length < 50}
                  onClick={() => {
                    setLoadingRecords(true);
                    void fetchDisposalCandidates(policy, records.at(-1)?.id)
                      .then((r) => {
                        setRecords(r);
                        setRecordId('');
                      })
                      .catch((e) => setError(errorMessage(e)))
                      .finally(() => setLoadingRecords(false));
                  }}
                >
                  Next records
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    busy || !recordId || ['bus_tracking_sessions', 'accounts'].includes(policy)
                  }
                  onClick={() => void download()}
                >
                  Download selected record
                </Button>
              </div>
              <form onSubmit={(e) => void save(e)} className="space-y-3">
                <h3 className="font-bold">
                  {editing ? `Review ${editing.reference}` : 'Preservation request'}
                </h3>
                <label className="block">
                  Internal case reference
                  <input
                    key={editing?.id || 'new'}
                    name="reference"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9._/\-]{0,63}"
                    className={field}
                    defaultValue={editing?.reference}
                    disabled={!!editing}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    Next review
                    <input name="reviewAt" type="datetime-local" required className={field} />
                  </label>
                  <label>
                    Minimum retention until (optional)
                    <input name="minimumUntil" type="datetime-local" className={field} />
                  </label>
                  <label>
                    Decision used at (if applicable)
                    <input name="decisionUsedAt" type="datetime-local" className={field} />
                  </label>
                </div>
                <p className="text-sm">
                  Use an internal reference without student names or incident details. Dates use
                  this device’s timezone. Decision use adds at least one calendar year; a review
                  never releases preservation. Preserve GPS from the trip page.
                </p>
                <Button type="submit" loading={busy} disabled={!editing && !recordId}>
                  Save record preservation
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel review
                  </Button>
                )}
              </form>
              <form
                className="space-y-3 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void mutate('extend', {
                    policy,
                    days: String(f.get('days')),
                    reference: String(f.get('reference')),
                  });
                }}
              >
                <h3 className="font-bold">Longer authority schedule</h3>
                <label className="block">
                  Minimum days
                  <input
                    className={field}
                    name="days"
                    type="number"
                    min={395}
                    max={3650}
                    required
                    defaultValue={395}
                  />
                </label>
                <label className="block">
                  Schedule reference
                  <input
                    className={field}
                    name="reference"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9._/\-]{0,63}"
                  />
                </label>
                <p className="text-sm">
                  Extensions apply to this authority and record type. They cannot shorten an
                  existing period or release preservation.
                </p>
                <Button type="submit" disabled={busy}>
                  Extend record schedule
                </Button>
                {status?.extensions.map((e) => (
                  <p key={e.policy}>
                    {policies[e.policy] || e.policy}: at least {e.days} days
                  </p>
                ))}
              </form>
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="text-xl font-bold">Record preservation requests</h2>
              {holds.length === 0 && <p>No preservation requests.</p>}
              {holds.map((h) => (
                <div key={h.id} className="space-y-2 border-t py-3">
                  <p className="font-bold">
                    {h.reference} · {policies[h.policy_key] || h.policy_key}
                  </p>
                  <p>
                    {h.released_at
                      ? 'Released'
                      : `Review ${new Date(h.review_at).toLocaleString()}`}{' '}
                    · Minimum {new Date(h.minimum_until).toLocaleString()}
                  </p>
                  {!h.released_at && (
                    <div className="flex flex-wrap gap-3">
                      <Button disabled={busy} variant="secondary" onClick={() => setEditing(h)}>
                        Review / extend record
                      </Button>
                      <Button
                        disabled={busy || Date.parse(h.minimum_until) > Date.now()}
                        variant="outline"
                        onClick={() => {
                          setRelease(h);
                          setConfirmed(false);
                        }}
                      >
                        Release record preservation
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  disabled={busy || Object.keys(cursor).length === 0}
                  onClick={() => setCursor({})}
                >
                  Newest requests
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || holds.length < 50}
                  onClick={() => {
                    const last = holds.at(-1);
                    if (last) setCursor({ before: last.created_at, beforeId: last.id });
                  }}
                >
                  Older requests
                </Button>
              </div>
              {release && (
                <div className="space-y-3 border border-danger-200 p-4">
                  <h3 className="font-bold">Release {release.reference}</h3>
                  <p>
                    Eligible records may be permanently deleted after release. Other preservation
                    requests and minimum periods still apply.
                  </p>
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I have verified this preservation request can be released.
                  </label>
                  <Button
                    variant="danger"
                    disabled={busy || !confirmed}
                    onClick={() => void mutate('release', { id: release.id, confirm: 'release' })}
                  >
                    Confirm record release
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setRelease(null)}>
                    Cancel release
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
