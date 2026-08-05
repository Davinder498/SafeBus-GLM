import { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  fetchStudentQrCredentialStatus,
  manageStudentQrCredential,
} from '@/services/studentQrCredentialService';

interface Props {
  studentId: string;
  studentName: string;
  disabled?: boolean;
}

function fakeQrSvgData(token: string): string {
  const cells = 29;
  let seed = 0;
  for (const char of token) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const rects = [];
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const finder = (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
      if (finder || seed % 3 === 0) {
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
      }
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} ${cells}" shape-rendering="crispEdges"><rect width="${cells}" height="${cells}" fill="white"/><g fill="black">${rects.join('')}</g></svg>`)}`;
}

export function StudentQrCredentialPanel({ studentId, studentName, disabled = false }: Props) {
  const [hasActive, setHasActive] = useState<boolean | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const badgeName = useMemo(() => {
    const [first = 'Student', last = ''] = studentName.split(' ');
    return `${first} ${last ? `${last[0]}.` : ''}`.trim();
  }, [studentName]);

  const load = useCallback(async () => {
    const status = await fetchStudentQrCredentialStatus(studentId);
    setHasActive(!!status?.hasActiveCredential);
  }, [studentId]);

  useEffect(() => {
    void load().catch(() => setError('Unable to load QR credential status.'));
  }, [load]);

  async function act(action: 'generate' | 'rotate' | 'revoke') {
    if (disabled) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await manageStudentQrCredential(studentId, action);
      setRawToken(result.rawToken);
      setMessage(
        action === 'revoke'
          ? 'Credential revoked.'
          : 'Credential created. Print or save now; the token cannot be retrieved later.',
      );
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'QR credential action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5" data-testid="admin-student-qr-panel">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-navy-700" aria-hidden />
          <h2 className="text-lg font-bold text-navy-900">QR badge</h2>
        </div>
        <p className="text-sm text-slate-600">
          Raw QR tokens are shown once. Rotating invalidates the old badge immediately. Do not email
          raw QR tokens.
        </p>
        {disabled && (
          <p className="rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-700">
            Reactivate the student to manage their QR badge.
          </p>
        )}
        {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
        {message && <p className="text-sm font-semibold text-success-700">{message}</p>}
        <p className="text-sm text-slate-700">
          Status:{' '}
          <strong>
            {hasActive
              ? 'Active credential'
              : hasActive === false
                ? 'No active credential'
                : 'Loading…'}
          </strong>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            className="w-full sm:w-auto"
            type="button"
            size="sm"
            disabled={disabled || busy || hasActive === true}
            onClick={() => void act('generate')}
            data-testid="admin-generate-qr"
          >
            Generate
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || busy || !hasActive}
            onClick={() => void act('rotate')}
            data-testid="admin-rotate-qr"
          >
            Rotate
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            size="sm"
            variant="danger"
            disabled={disabled || busy || !hasActive}
            onClick={() => void act('revoke')}
            data-testid="admin-revoke-qr"
          >
            Revoke
          </Button>
        </div>
        {rawToken && (
          <div
            className="rounded-xl border border-gray-200 bg-white p-4 print:border-0"
            data-testid="admin-qr-generation-result"
          >
            <div className="mx-auto max-w-xs text-center">
              <p className="text-sm font-semibold text-gray-500">SafeBus</p>
              <h3 className="text-xl font-bold text-navy-900">{badgeName}</h3>
              <img
                alt="Student QR badge"
                src={fakeQrSvgData(rawToken)}
                className="mx-auto my-4 h-56 w-56"
              />
              <p className="text-sm text-gray-700">Scan when boarding or leaving the bus.</p>
              <p className="mt-3 text-xs font-semibold text-danger-700">
                Print/save now. Dismissing this result removes the raw token from the browser view.
              </p>
              <Button
                type="button"
                className="mt-3 print:hidden"
                size="sm"
                onClick={() => window.print()}
                data-testid="admin-print-qr"
              >
                Print badge
              </Button>
              <Button
                type="button"
                className="ml-2 mt-3 print:hidden"
                size="sm"
                variant="ghost"
                onClick={() => setRawToken(null)}
                data-testid="admin-dismiss-qr-token"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
