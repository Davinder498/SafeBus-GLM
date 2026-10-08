import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  fetchStudentQrCredentialStatus,
  manageStudentQrCredential,
} from '@/services/studentQrCredentialService';

interface Props {
  studentId: string;
  studentName: string;
  disabled?: boolean;
}
type CredentialAction = 'generate' | 'rotate' | 'revoke';

export function StudentQrCredentialPanel({ studentId, studentName, disabled = false }: Props) {
  const [hasActive, setHasActive] = useState<boolean | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<'rotate' | 'revoke' | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const [first = 'Student', ...rest] = studentName.trim().split(/\s+/);
  const badgeName = `${first}${rest.length ? ` ${rest.at(-1)?.[0]}.` : ''}`;

  useEffect(() => {
    const request = ++requestRef.current;
    setHasActive(null);
    setQrDataUrl(null);
    setMessage(null);
    setError(null);
    setConfirmation(null);
    busyRef.current = false;
    setBusy(false);
    void fetchStudentQrCredentialStatus(studentId)
      .then((status) => {
        if (request === requestRef.current) setHasActive(!!status?.hasActiveCredential);
      })
      .catch(() => {
        if (request === requestRef.current)
          setError('Unable to load the student QR status. Reload before issuing a pass.');
      });
    return () => {
      requestRef.current += 1;
      document.body.classList.remove('printing-student-qr');
    };
  }, [studentId]);

  async function act(action: CredentialAction) {
    if (busyRef.current || hasActive === null || (disabled && action !== 'revoke')) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setQrDataUrl(null);
    const request = requestRef.current;
    try {
      const result = await manageStudentQrCredential(studentId, action);
      if (request !== requestRef.current) return;
      setHasActive(result.status === 'active');
      if (result.rawToken) {
        const image = await QRCode.toDataURL(result.rawToken, {
          width: 640,
          margin: 4,
          errorCorrectionLevel: 'M',
        });
        if (request !== requestRef.current) return;
        setQrDataUrl(image);
      }
      setMessage(
        action === 'revoke'
          ? 'Student QR revoked.'
          : 'Student QR created. Print or download now; it cannot be retrieved later.',
      );
    } catch {
      if (request === requestRef.current) {
        setError(
          'Could not finish issuing this pass. Reload to check its status before replacing or revoking it.',
        );
        setHasActive(null);
      }
    } finally {
      if (request === requestRef.current) {
        busyRef.current = false;
        setBusy(false);
        setConfirmation(null);
      }
    }
  }

  function printPass() {
    document.body.classList.add('printing-student-qr');
    window.addEventListener(
      'afterprint',
      () => document.body.classList.remove('printing-student-qr'),
      { once: true },
    );
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <Card className="p-5" data-testid="admin-student-qr-panel">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-navy-700" aria-hidden />
          <h2 className="text-lg font-bold text-navy-900">Student QR pass</h2>
        </div>
        <p className="text-sm text-slate-600">
          Print or download the pass when it is issued. Replacing a pass invalidates the old QR
          immediately.
        </p>
        {disabled && (
          <p className="text-sm font-semibold text-warning-700">
            Reactivate the student to issue a pass. An existing pass can still be revoked.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm font-semibold text-success-700">
            {message}
          </p>
        )}
        <p className="text-sm">
          Status:{' '}
          <strong>
            {hasActive
              ? 'Active QR'
              : hasActive === false
                ? 'No active QR'
                : error
                  ? 'Unavailable'
                  : 'Loading...'}
          </strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={disabled || busy || hasActive !== false}
            onClick={() => void act('generate')}
            data-testid="admin-generate-qr"
          >
            Generate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || busy || hasActive !== true}
            onClick={() => setConfirmation('rotate')}
            data-testid="admin-rotate-qr"
          >
            Replace
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || hasActive !== true}
            onClick={() => setConfirmation('revoke')}
            data-testid="admin-revoke-qr"
          >
            Revoke
          </Button>
        </div>
        {qrDataUrl && (
          <div
            className="student-qr-print-sheet rounded-xl border bg-white p-4 text-center"
            data-testid="admin-qr-generation-result"
          >
            <p className="text-sm font-semibold text-gray-500">BusSafe Alberta</p>
            <h3 className="text-xl font-bold text-navy-900">{badgeName}</h3>
            <img
              alt="Student QR pass"
              src={qrDataUrl}
              className="mx-auto my-4 h-56 w-56 max-w-full"
            />
            <p className="text-sm">Scan when boarding or leaving the bus.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
              <Button size="sm" onClick={printPass} data-testid="admin-print-qr">
                Print
              </Button>
              <a
                className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold"
                href={qrDataUrl}
                download="BusSafe-student-pass.png"
              >
                Download PNG
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setQrDataUrl(null)}
                data-testid="admin-dismiss-qr-token"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation === 'rotate' ? 'Replace student pass?' : 'Revoke student pass?'}
        description="The current QR will stop working immediately."
        confirmLabel={confirmation === 'rotate' ? 'Replace pass' : 'Revoke pass'}
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
