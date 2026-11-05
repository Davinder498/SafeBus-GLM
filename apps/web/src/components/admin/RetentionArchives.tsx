import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { retentionAction } from '@/services/retentionService';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';
interface Chunk {
  id: string;
  created_at: string;
}
export function RetentionArchives({ caseId }: { caseId: string }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(older = false) {
    setBusy(true);
    setError('');
    try {
      const nextCursor: Record<string, string> =
        older && chunks.length
          ? { before: chunks[chunks.length - 1].created_at, beforeId: chunks[chunks.length - 1].id }
          : {};
      const value = await retentionAction('archives', { id: caseId, ...nextCursor });
      if (
        !Array.isArray(value) ||
        !value.every(
          (v: unknown) =>
            v &&
            typeof v === 'object' &&
            'id' in v &&
            typeof v.id === 'string' &&
            'created_at' in v &&
            typeof v.created_at === 'string',
        )
      )
        throw new Error('Invalid archive list.');
      setChunks(value as Chunk[]);
      setCursor(nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load archives.');
    } finally {
      setBusy(false);
    }
  }
  async function download(chunk: Chunk) {
    setBusy(true);
    setError('');
    try {
      const payload = await retentionAction('archive_read', {
        id: caseId,
        chunkId: chunk.id,
        ...cursor,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `safebus-evidence-${chunk.id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download archive.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>
        View GPS archives
      </Button>
      {error && (
        <p role="alert" className="text-danger-700">
          {error}
        </p>
      )}
      {chunks.length > 0 && (
        <>
          <p className="text-sm">
            Downloads contain sensitive bus location evidence. Store only in your authority’s
            approved records system.
          </p>
          <div className="flex flex-wrap gap-2">
            {chunks.map((chunk) => (
              <Button
                key={chunk.id}
                variant="outline"
                disabled={busy}
                onClick={() => void download(chunk)}
              >
                Download {formatAdminTripTimestamp(chunk.created_at)}
              </Button>
            ))}
          </div>
          {chunks.length === 20 && (
            <Button variant="secondary" disabled={busy} onClick={() => void load(true)}>
              Older archive chunks
            </Button>
          )}
        </>
      )}
    </div>
  );
}
