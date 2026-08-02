import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

  const load = useCallback(async () => {
    const status = await fetchBusQrCredentialStatus(busId);
    setHasActive(!!status?.hasActiveCredential);
  }, [busId]);

  useEffect(() => {
    void load().catch(() => setError('Unable to load the bus QR status.'));
  }, [load]);

  async function act(action: BusQrCredentialAction) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await manageBusQrCredential(busId, action);
      if (result.rawToken) {
        setQrDataUrl(
          await QRCode.toDataURL(result.rawToken, {
            width: 640,
            margin: 3,
            errorCorrectionLevel: 'M',
          }),
        );
      } else {
        setQrDataUrl(null);
      }
      setMessage(
        action === 'revoke'
          ? 'Bus QR revoked.'
          : 'Bus QR created. Print it now; the raw credential cannot be retrieved later.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to manage the bus QR.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 border-blue-200 p-5" data-testid="admin-bus-qr-panel">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Driver scan QR</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mount this QR inside Bus {busNumber}. An authenticated active driver scans it to turn
            that phone into this bus&apos;s GPS for the prepared run.
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
            disabled={busy || hasActive === true}
            onClick={() => void act('generate')}
          >
            Generate QR
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !hasActive}
            onClick={() => void act('rotate')}
          >
            Replace QR
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy || !hasActive}
            onClick={() => void act('revoke')}
          >
            Revoke QR
          </Button>
        </div>
        {qrDataUrl && (
          <div
            className="rounded-xl border border-gray-200 bg-white p-4 text-center print:border-0"
            data-testid="admin-bus-qr-result"
          >
            <p className="text-sm font-semibold text-gray-500">SafeBus Alberta</p>
            <h3 className="text-2xl font-bold text-navy-900">Bus {busNumber}</h3>
            <img
              alt={`Driver scan QR for Bus ${busNumber}`}
              src={qrDataUrl}
              className="mx-auto my-4 h-64 w-64"
            />
            <p className="text-sm text-gray-700">Driver: open SafeBus and choose Scan to start.</p>
            <Button
              type="button"
              size="sm"
              className="mt-3 print:hidden"
              onClick={() => window.print()}
            >
              Print QR
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
