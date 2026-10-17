import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { QrReprintControl } from '@/components/admin/QrReprintControl';
import {
  fetchBusQrCredentialStatus,
  manageBusQrCredential,
  type BusQrCredentialAction,
} from '@/services/busQrCredentialService';

export function BusQrCredentialPanel({ busId, busNumber }: { busId: string; busNumber: string }) {
  const [hasActive, setHasActive] = useState<boolean | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<'rotate' | 'revoke' | null>(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const request = ++sequence.current;
    setHasActive(null);
    setQrDataUrl(null);
    setError(null);
    setMessage(null);
    setConfirmation(null);
    setBusy(false);
    busyRef.current = false;
    void fetchBusQrCredentialStatus(busId)
      .then((status) => {
        if (request === sequence.current) setHasActive(!!status?.hasActiveCredential);
      })
      .catch(() => {
        if (request === sequence.current) setError('Unable to load the bus QR status.');
      });
    return () => {
      sequence.current = request + 1;
      document.body.classList.remove('printing-bus-qr');
    };
  }, [busId]);

  async function act(action: BusQrCredentialAction) {
    if (busyRef.current || hasActive === null) return;
    busyRef.current = true;
    const request = sequence.current;
    setBusy(true);
    setError(null);
    setMessage(null);
    setQrDataUrl(null);
    try {
      const result = await manageBusQrCredential(busId, action);
      if (request !== sequence.current) return;
      setHasActive(result.status === 'active');
      if (result.rawToken) {
        const image = await QRCode.toDataURL(result.rawToken, {
          width: 640,
          margin: 3,
          errorCorrectionLevel: 'M',
        });
        if (request !== sequence.current) return;
        setQrDataUrl(image);
      } else {
        setQrDataUrl(null);
      }
      setMessage(
        action === 'revoke'
          ? 'Bus QR revoked.'
          : 'Bus QR created. You can print or download the same code again later.',
      );
    } catch {
      if (request === sequence.current) {
        setHasActive(null);
        setError('Unable to manage this bus QR. Reload to check its status before trying again.');
      }
    } finally {
      if (request === sequence.current) {
        setBusy(false);
        busyRef.current = false;
        setConfirmation(null);
      }
    }
  }

  function printQr() {
    const printClass = 'printing-bus-qr';
    const cleanup = () => document.body.classList.remove(printClass);
    document.body.classList.add(printClass);
    window.addEventListener('afterprint', cleanup, { once: true });
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <Card className="mt-6 border-blue-200 p-5" data-testid="admin-bus-qr-panel">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Driver scan QR</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mount this QR inside Bus {busNumber}. An authenticated active driver scans it to turn
            that phone into this bus&apos;s GPS for the selected route direction.
          </p>
        </div>
        {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
        {message && <p className="text-sm font-semibold text-success-700">{message}</p>}
        <p className="text-sm">
          Status:{' '}
          <strong>
            {hasActive ? 'Active QR' : hasActive === false ? 'No active QR' : 'Loading...'}
          </strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || hasActive !== false}
            onClick={() => void act('generate')}
          >
            Generate QR
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !hasActive}
            onClick={() => setConfirmation('rotate')}
          >
            Replace QR
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy || !hasActive}
            onClick={() => setConfirmation('revoke')}
          >
            Revoke QR
          </Button>
        </div>
        {hasActive && (
          <QrReprintControl kind="bus" entityId={busId} disabled={busy} onImage={setQrDataUrl} />
        )}
        {qrDataUrl && (
          <div
            className="bus-qr-print-sheet rounded-xl border border-gray-200 bg-white p-4 text-center print:border-0"
            data-testid="admin-bus-qr-result"
          >
            <p className="text-sm font-semibold text-gray-500">SafeBus</p>
            <h3 className="text-2xl font-bold text-navy-900">Bus {busNumber}</h3>
            <img
              alt={`Driver scan QR for Bus ${busNumber}`}
              src={qrDataUrl}
              className="mx-auto my-4 h-64 w-64"
            />
            <p className="text-sm text-gray-700">Driver: open SafeBus and choose Scan to start.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
              <Button type="button" size="sm" onClick={printQr}>
                Print QR
              </Button>
              <a
                className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold"
                href={qrDataUrl}
                download="SafeBus-bus-QR.png"
              >
                Download PNG
              </a>
              <Button type="button" size="sm" variant="ghost" onClick={() => setQrDataUrl(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation === 'rotate' ? 'Replace bus QR?' : 'Revoke bus QR?'}
        description="The current printed QR will stop working immediately. To print another copy of the same QR, use View / download existing QR."
        confirmLabel={confirmation === 'rotate' ? 'Replace code' : 'Revoke code'}
        destructive
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) void act(confirmation);
        }}
      />
    </Card>
  );
}
