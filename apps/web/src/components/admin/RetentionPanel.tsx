import { RetentionAnnouncements } from './RetentionAnnouncements';
import { Link } from 'react-router';
import { RetentionArchives } from './RetentionArchives';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  listRetentionCases,
  retentionAction,
  type RetentionCase,
} from '@/services/retentionService';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';

const field = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-navy-900';
const localDateTime = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
function RetentionControls({ tripId }: { tripId?: string }) {
  const [cases, setCases] = useState<RetentionCase[]>([]);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<RetentionCase | 'new' | null>(null);
  const [release, setRelease] = useState<RetentionCase | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCases(await listRetentionCases({ ...(tripId ? { tripId } : {}), ...cursor }));
    } catch (cause) {
      setCases([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load preserved records.');
    } finally {
      setLoading(false);
    }
  }, [tripId, cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const iso = (name: string) => new Date(String(data.get(name))).toISOString();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const values: Record<string, string> = { reviewAt: iso('reviewAt') };
      if (data.get('minimumUntil')) values.minimumUntil = iso('minimumUntil');
      if (data.get('decisionUsedAt')) values.decisionUsedAt = iso('decisionUsedAt');
      if (editing === 'new') {
        values.tripId = tripId || '';
        values.reason = String(data.get('reason'));
        values.reference = String(data.get('reference'));
        if (data.get('windowStart')) values.windowStart = iso('windowStart');
        if (data.get('windowEnd')) values.windowEnd = iso('windowEnd');
      } else if (editing) values.id = editing.id;
      await retentionAction(editing === 'new' ? 'create' : 'review', values);
      setEditing(null);
      setNotice('Preservation saved. Records stay protected until explicitly released.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preservation could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function releaseCase() {
    if (!release || !confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await retentionAction('release', { id: release.id, confirm: 'release' });
      setRelease(null);
      setConfirmed(false);
      setNotice(
        'Preservation released. Normal expiry and other preservation requests still apply.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preservation could not be released.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy-900">Preserved records</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || loading} onClick={() => void load()}>
            Refresh
          </Button>
          {tripId && (
            <Button
              disabled={busy || !!editing || !!release}
              onClick={() => {
                setEditing('new');
                setNotice('');
              }}
            >
              Preserve trip records
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-navy-900">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading preserved records…</p>
      ) : !error && cases.length === 0 ? (
        <p>No preservation requests.</p>
      ) : null}
      {!loading &&
        cases.map((item) => (
          <div key={item.id} className="space-y-2 rounded-lg border border-gray-200 p-4">
            <Link
              className="font-semibold text-navy-700 underline"
              to={`/admin/trips/${item.driver_trip_id}`}
            >
              View trip
            </Link>
            <p className="font-semibold">
              {item.reference} · {item.released_at ? 'Released' : 'Preserved'}
            </p>
            <p className="text-sm">
              {item.reason.replaceAll('_', ' ')} · {formatAdminTripTimestamp(item.window_start)} to{' '}
              {formatAdminTripTimestamp(item.window_end)}
            </p>
            <p className="text-sm">
              Minimum: {formatAdminTripTimestamp(item.minimum_until)} · Review:{' '}
              {formatAdminTripTimestamp(item.review_at)}
              {!item.released_at && Date.parse(item.review_at) <= Date.now() ? ' · Review due' : ''}
            </p>
            <p className="text-sm">
              Verified GPS archive chunks: {item.verified_chunks}. Review dates do not release
              records.
            </p>
            {!item.released_at && item.verified_chunks > 0 && (
              <RetentionArchives caseId={item.id} />
            )}
            {!item.released_at && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !!editing || !!release}
                  onClick={() => setEditing(item)}
                >
                  Review / extend
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy || !!editing || !!release || Date.parse(item.minimum_until) > Date.now()
                  }
                  onClick={() => {
                    setRelease(item);
                    setConfirmed(false);
                  }}
                >
                  Release preservation
                </Button>
              </div>
            )}
          </div>
        ))}
      {!loading && !error && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={busy || Object.keys(cursor).length === 0}
            onClick={() => setCursor({})}
          >
            Newest
          </Button>
          <Button
            variant="secondary"
            disabled={busy || cases.length < 50}
            onClick={() => {
              const last = cases.at(-1);
              if (last) setCursor({ before: last.created_at, beforeId: last.id });
            }}
          >
            Older requests
          </Button>
        </div>
      )}
      {editing && (
        <form
          onSubmit={(event) => void save(event)}
          className="space-y-4 rounded-lg border border-navy-200 p-4"
        >
          <h3 className="font-bold">
            {editing === 'new' ? 'Preserve trip records' : `Review ${editing.reference}`}
          </h3>
          <p className="text-sm">
            Dates use this device’s local timezone. Preserve before routine expiry; deleted records
            cannot be recovered. Use an internal reference, without student names or incident
            details.
          </p>
          {editing === 'new' && (
            <>
              <label className="block">
                Case reference
                <input
                  name="reference"
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9][A-Za-z0-9._\/\-]{0,63}"
                  className={field}
                />
              </label>
              <label className="block">
                Reason
                <select name="reason" className={field}>
                  <option value="incident">Incident</option>
                  <option value="dispute">Dispute</option>
                  <option value="access_request">Access request</option>
                  <option value="decision">Decision</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Window start (optional)
                  <input type="datetime-local" name="windowStart" className={field} />
                </label>
                <label>
                  Window end (optional)
                  <input type="datetime-local" name="windowEnd" className={field} />
                </label>
              </div>
              <p className="text-sm">
                Leave the window blank to preserve the trip from its start to its recorded end, or
                the current time for an ongoing trip.
              </p>
            </>
          )}
          <label className="block">
            Decision used at (required for a decision)
            <input type="datetime-local" name="decisionUsedAt" className={field} />
          </label>
          <label className="block">
            Minimum retention until (optional)
            <input type="datetime-local" name="minimumUntil" className={field} />
          </label>
          <label className="block">
            Next review
            <input
              type="datetime-local"
              required
              name="reviewAt"
              defaultValue={localDateTime(new Date(Date.now() + 30 * 86400000))}
              className={field}
            />
          </label>
          <p className="text-sm">
            Decision use sets a minimum of one calendar year. Authority requirements may require
            longer. Reviewing cannot shorten the minimum or release records.
          </p>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Save preservation
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {release && (
        <div className="space-y-3 rounded-lg border border-danger-200 p-4">
          <h3 className="font-bold">Release {release.reference}</h3>
          <p>
            Records eligible under normal retention may be permanently deleted, including archived
            GPS. Other preservation requests remain in effect.
          </p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-5 w-5"
            />
            I have verified that this preservation request can be released.
          </label>
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={busy}
              disabled={!confirmed}
              onClick={() => void releaseCase()}
            >
              Release preservation
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setRelease(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!tripId && <RetentionAnnouncements />}
    </Card>
  );
}
export function RetentionPanel({ tripId }: { tripId?: string }) {
  const { profile } = useAuth();
  if (!profile || !['tenant_admin', 'transportation_admin'].includes(profile.role)) return null;
  return <RetentionControls key={tripId || 'all'} tripId={tripId} />;
}
