import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { BulkQrSheets } from '@/components/admin/BulkQrSheets';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/useAuth';
import { collectDownloadRecords } from '@/services/adminDownloadService';
import type { AdminListQuery } from '@/types/pagination';
import { downloadCsv, type DownloadEntity } from '@/utils/dataDownloads';

export function AdminDataDownloads({
  entity,
  query,
  disabled = false,
  actions,
}: {
  entity: DownloadEntity;
  query: Omit<AdminListQuery, 'page' | 'pageSize'>;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const { user, profile } = useAuth();
  const allowed =
    profile?.role === 'tenant_admin' && profile.status === 'active' && !!profile.tenant_id;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify([
    entity,
    user?.id,
    profile?.tenant_id,
    profile?.role,
    profile?.status,
    query,
  ]);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError(null);
    setMessage(null);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [contextKey]);

  async function download() {
    if (!allowed || !user || !profile?.tenant_id || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setMessage('Preparing download...');
    try {
      const rows = await collectDownloadRecords(
        entity,
        query,
        { userId: user.id, tenantId: profile.tenant_id },
        {
          signal: controller.signal,
          onProgress: (loaded, total) => {
            if (!controller.signal.aborted)
              setMessage(
                `Preparing ${loaded.toLocaleString()} of ${total.toLocaleString()} records...`,
              );
          },
        },
      );
      controller.signal.throwIfAborted();
      if (request.current !== controller) return;
      downloadCsv(entity, rows);
      setMessage(`Downloaded ${rows.length.toLocaleString()} ${entity}.`);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The download failed. Try again.');
        setMessage(null);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  if (!allowed) return actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null;
  const downloadActions = (
    <>
      <Button
        type="button"
        variant="outline"
        leftIcon={<Download className="h-4 w-4" aria-hidden />}
        disabled={disabled}
        loading={busy}
        onClick={() => void download()}
      >
        Download CSV
      </Button>
      {busy && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            request.current?.abort();
            request.current = null;
            setBusy(false);
            setMessage('Download cancelled.');
          }}
        >
          Cancel download
        </Button>
      )}
    </>
  );
  return (
    <div className="space-y-2" data-testid="admin-data-downloads">
      {entity === 'students' || entity === 'buses' ? (
        <BulkQrSheets
          kind={entity === 'students' ? 'student' : 'bus'}
          query={query}
          disabled={disabled || busy}
          leadingActions={downloadActions}
          trailingActions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {downloadActions}
          {actions}
        </div>
      )}
      <p className="text-sm text-slate-600">
        All records matching the current filters, across every page.
      </p>
      {message && (
        <p role="status" className="text-sm text-navy-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
