import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { getPrintableQr, readOriginalQrImage, type QrKind } from '@/services/qrPrintService';

export function QrReprintControl({
  kind,
  entityId,
  disabled,
  onImage,
}: {
  kind: QrKind;
  entityId: string;
  disabled?: boolean;
  onImage: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [needsOriginal, setNeedsOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const onImageRef = useRef(onImage);
  onImageRef.current = onImage;
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [entityId],
  );
  useEffect(() => {
    if (disabled) {
      request.current?.abort();
      request.current = null;
      setBusy(false);
    }
  }, [disabled]);
  async function prepare(file?: File) {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    onImageRef.current(null);
    try {
      const originalToken = file ? await readOriginalQrImage(file) : undefined;
      controller.signal.throwIfAborted();
      const qr = await getPrintableQr(kind, entityId, { originalToken, signal: controller.signal });
      if (qr.status === 'needs_original') {
        setNeedsOriginal(true);
        return;
      }
      if (!qr.token) throw new Error('No active QR is available. Issue one first.');
      const image = await QRCode.toDataURL(qr.token, {
        width: 640,
        margin: 4,
        errorCorrectionLevel: 'M',
      });
      controller.signal.throwIfAborted();
      onImageRef.current(image);
      setNeedsOriginal(false);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'The QR could not be prepared.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        loading={busy}
        onClick={() => void prepare()}
      >
        View / download existing QR
      </Button>
      {needsOriginal && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            This QR predates saved reprints. Choose its original saved image or a clear photo of the
            printed QR once. The same code stays valid.
          </p>
          <label className="mt-2 block font-semibold">
            Original QR image
            <input
              className="mt-2 block w-full"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void prepare(file);
              }}
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
