import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/contexts/useAuth';
import { collectDownloadRecords, verifyDownloadContext } from '@/services/adminDownloadService';
import { getPrintableQr } from '@/services/qrPrintService';
import type { AdminListQuery } from '@/types/pagination';
import type { DownloadRow } from '@/utils/dataDownloads';

const MAX_SHEET_RECORDS = 200;
type Pass = { id: string; label: string; image: string };
function label(row: DownloadRow, kind: 'student' | 'bus') {
  if (kind === 'bus') return `Bus ${row.bus_number}`;
  const last = String(row.last_name ?? '').trim();
  return `${row.preferred_name || row.first_name || 'Student'}${last ? ` ${last[0]}.` : ''}`;
}
export function BulkQrSheets({
  kind,
  query,
  disabled,
}: {
  kind: 'student' | 'bus';
  query: Omit<AdminListQuery, 'page' | 'pageSize'>;
  disabled?: boolean;
}) {
  const { user, profile } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [originals, setOriginals] = useState<Array<{ id: string; label: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify([
    kind,
    query,
    user?.id,
    profile?.tenant_id,
    profile?.role,
    profile?.status,
  ]);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setPasses([]);
    setOriginals([]);
    setBusy(false);
    setConfirm(false);
    setMessage(null);
    setError(null);
    return () => {
      request.current?.abort();
      request.current = null;
      document.body.classList.remove('printing-qr-batch');
    };
  }, [key]);
  async function prepare() {
    if (!user || !profile?.tenant_id || profile.role !== 'tenant_admin' || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const context = { userId: user.id, tenantId: profile.tenant_id };
    setConfirm(false);
    setBusy(true);
    setError(null);
    setPasses([]);
    setOriginals([]);
    setMessage('Preparing QR sheets...');
    try {
      const rows = await collectDownloadRecords(
        kind === 'student' ? 'students' : 'buses',
        query,
        context,
        {
          signal: controller.signal,
          maxRecords: MAX_SHEET_RECORDS,
        },
      );
      const next: Pass[] = [];
      const needsOriginal: Array<{ id: string; label: string }> = [];
      let skipped = 0;
      for (const row of rows) {
        controller.signal.throwIfAborted();
        if (
          (kind === 'student' && row.status !== 'active') ||
          (kind === 'bus' && row.status === 'retired')
        ) {
          skipped++;
          continue;
        }
        const qr = await getPrintableQr(kind, row.id, {
          issueMissing: true,
          signal: controller.signal,
        });
        if (qr.status === 'needs_original')
          needsOriginal.push({ id: row.id, label: label(row, kind) });
        else if (qr.status === 'ready' && qr.token)
          next.push({
            id: row.id,
            label: label(row, kind),
            image: await QRCode.toDataURL(qr.token, {
              width: 640,
              margin: 4,
              errorCorrectionLevel: 'M',
            }),
          });
        else throw new Error('A QR could not be prepared. Try again.');
        controller.signal.throwIfAborted();
        setMessage(`Prepared ${next.length} of ${rows.length} QR codes...`);
      }
      await verifyDownloadContext(context, controller.signal);
      controller.signal.throwIfAborted();
      setPasses(next);
      setOriginals(needsOriginal);
      setMessage(
        `${next.length} QR codes ready. ${needsOriginal.length} need an original image. ${skipped} ineligible records skipped.`,
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'QR preparation failed.');
        setMessage('Any codes already issued remain saved. Preparing again reuses them.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function print() {
    document.body.classList.add('printing-qr-batch');
    window.addEventListener(
      'afterprint',
      () => document.body.classList.remove('printing-qr-batch'),
      { once: true },
    );
    window.requestAnimationFrame(() => window.print());
  }
  if (profile?.role !== 'tenant_admin' || profile.status !== 'active') return null;
  return (
    <div className="space-y-3" data-testid="bulk-qr-sheets">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          loading={busy}
          onClick={() => setConfirm(true)}
        >
          Prepare QR sheets
        </Button>
        {busy && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              request.current?.abort();
              request.current = null;
              setBusy(false);
              setMessage(
                'Preparation cancelled. Codes already issued remain saved for reprinting.',
              );
            }}
          >
            Cancel QR preparation
          </Button>
        )}
        {passes.length > 0 && (
          <>
            <Button type="button" onClick={print}>
              Print QR sheets
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPasses([]);
                setOriginals([]);
                setMessage(null);
              }}
            >
              Dismiss QR sheets
            </Button>
          </>
        )}
      </div>
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
      {originals.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p>
            These existing codes stay valid. Open the record and save an original QR image to enable
            reprinting, then prepare this batch again.
          </p>
          <ul className="mt-2 flex flex-wrap gap-3">
            {originals.map((row) => (
              <li key={row.id}>
                <Link
                  className="font-semibold text-navy-700 underline"
                  to={`/admin/${kind === 'student' ? 'students' : 'buses'}/${row.id}`}
                >
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {passes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3" aria-label="QR sheet preview">
          {passes.map((pass) => (
            <div key={pass.id} className="rounded-lg border bg-white p-4 text-center">
              <p className="font-bold">{pass.label}</p>
              <img className="mx-auto h-40 w-40" src={pass.image} alt={`QR for ${pass.label}`} />
            </div>
          ))}
        </div>
      )}
      {passes.length > 0 &&
        createPortal(
          <div className="qr-batch-print-root" aria-hidden="true">
            {Array.from({ length: Math.ceil(passes.length / 12) }, (_, page) => (
              <section className="qr-batch-print-page" key={page}>
                {passes.slice(page * 12, page * 12 + 12).map((pass) => (
                  <article key={pass.id}>
                    <p>SafeBus</p>
                    <h2>{pass.label}</h2>
                    <img src={pass.image} alt="" />
                    <p>
                      {kind === 'student'
                        ? 'Scan when boarding or leaving the bus.'
                        : 'Driver: scan in SafeBus to start.'}
                    </p>
                  </article>
                ))}
              </section>
            ))}
          </div>,
          document.body,
        )}
      <ConfirmDialog
        open={confirm}
        title="Prepare QR sheets?"
        confirmLabel="Prepare sheets"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void prepare()}
        description="Uses all filtered records, up to 200 per batch. Existing QR codes stay the same. Missing codes are issued for eligible records. Use search filters for larger lists."
      />
    </div>
  );
}
