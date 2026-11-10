import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { retentionAction } from '@/services/retentionService';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';
interface Announcement {
  id: string;
  title: string;
  created_at: string;
  resolved_at: string | null;
}
export function RetentionAnnouncements() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [loaded, setLoaded] = useState(false);
  async function load(nextCursor: Record<string, string> = cursor) {
    setBusy(true);
    setError('');
    try {
      const value = await retentionAction('announcements', nextCursor);
      if (
        !Array.isArray(value) ||
        !value.every(
          (v: unknown) =>
            v &&
            typeof v === 'object' &&
            'id' in v &&
            typeof v.id === 'string' &&
            'title' in v &&
            typeof v.title === 'string' &&
            'created_at' in v &&
            typeof v.created_at === 'string' &&
            'resolved_at' in v &&
            (v.resolved_at === null || typeof v.resolved_at === 'string'),
        )
      )
        throw new Error('Invalid announcement retention response.');
      setRows(value as Announcement[]);
      setCursor(nextCursor);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load announcement retention.');
    } finally {
      setBusy(false);
    }
  }
  async function resolve() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await retentionAction('resolve_announcement', { id: selected.id });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resolve announcement.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t border-gray-200 pt-4 text-[var(--color-text)]">
      <h3 className="font-bold text-[var(--color-heading)]">Standalone service announcements</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        Unresolved records stay available. Confirm resolution only after the service issue and any
        preservation obligations are resolved; the 395-day retention period then begins.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>
        {loaded ? 'Refresh announcements' : 'Load announcements'}
      </Button>
      {error && (
        <p role="alert" className="text-danger-700">
          {error}
        </p>
      )}
      {loaded && rows.length === 0 && <p>No announcement records.</p>}
      {loaded &&
        rows.map((row) => (
          <div className="rounded-lg border border-gray-200 p-3" key={row.id}>
            <p className="font-semibold">{row.title}</p>
            <p className="text-sm">
              Sent {formatAdminTripTimestamp(row.created_at)} ·{' '}
              {row.resolved_at
                ? `Resolved ${formatAdminTripTimestamp(row.resolved_at)}`
                : 'Unresolved'}
            </p>
            {!row.resolved_at && (
              <Button
                variant="outline"
                disabled={busy || !!selected}
                onClick={() => setSelected(row)}
              >
                Confirm resolution
              </Button>
            )}
          </div>
        ))}
      {loaded && rows.length === 50 && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            const last = rows.at(-1);
            if (last) void load({ before: last.created_at, beforeId: last.id });
          }}
        >
          Older announcements
        </Button>
      )}
      {selected && (
        <div className="space-y-3 rounded-lg border border-navy-200 p-3">
          <p>
            Confirm that “{selected.title}” is resolved and has no outstanding preservation
            requirement. This starts routine expiry; it does not send a new announcement.
          </p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void resolve()}>
              Mark resolved
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
