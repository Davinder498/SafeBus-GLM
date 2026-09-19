import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  resolveStudentQrForActiveTrip,
  type StudentQrScanResult,
} from '@/services/studentQrScanService';
import { isLikelyStudentQrToken, shouldProcessScan } from '@/utils/studentQr';

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

interface Props {
  onRecord: (studentId: string, action: 'pickup' | 'dropoff') => Promise<boolean>;
  busyStudentId: string | null;
}

type ScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'permission-denied'
  | 'no-camera'
  | 'unsupported'
  | 'resolving'
  | 'recording'
  | 'recorded'
  | 'complete'
  | 'invalid'
  | 'record-failed';

function actionForResult(result: StudentQrScanResult | null): 'pickup' | 'dropoff' | null {
  if (result?.nextEventType === 'picked_up') return 'pickup';
  if (result?.nextEventType === 'dropped_off') return 'dropoff';
  return null;
}

function actionLabel(action: 'pickup' | 'dropoff'): string {
  return action === 'pickup' ? 'pickup' : 'drop-off';
}

export function StudentQrScanner({ onRecord, busyStudentId }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRequestRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const processingRef = useRef(false);
  const clearFrameSinceLastScanRef = useRef(true);
  const lastRef = useRef<{ value: string | null; at: number }>({ value: null, at: 0 });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScannerState>('idle');
  const [result, setResult] = useState<StudentQrScanResult | null>(null);
  const [recordedAction, setRecordedAction] = useState<'pickup' | 'dropoff' | null>(null);
  const [manualToken, setManualToken] = useState('');

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      cameraRequestRef.current += 1;
      stopCamera();
    },
    [stopCamera],
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || (state !== 'starting' && state !== 'scanning')) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [state]);

  const recordResolvedStudent = useCallback(
    async (resolved: StudentQrScanResult, action: 'pickup' | 'dropoff') => {
      setState('recording');
      const recorded = await onRecord(resolved.studentId, action);
      if (recorded) {
        setRecordedAction(action);
        setState('recorded');
      } else {
        setState('record-failed');
      }
    },
    [onRecord],
  );

  const processToken = useCallback(
    async (token: string) => {
      if (processingRef.current) return;

      const value = token.trim();
      const now = Date.now();
      if (value === lastRef.current.value && !clearFrameSinceLastScanRef.current) {
        return;
      }
      if (!shouldProcessScan(lastRef.current.value, value, lastRef.current.at, now)) return;

      lastRef.current = { value, at: now };
      clearFrameSinceLastScanRef.current = false;
      processingRef.current = true;
      stopCamera();
      setRecordedAction(null);

      if (!isLikelyStudentQrToken(value)) {
        setResult(null);
        setState('invalid');
        processingRef.current = false;
        return;
      }

      setState('resolving');
      try {
        const resolved = await resolveStudentQrForActiveTrip(value);
        setResult(resolved);
        const action = actionForResult(resolved);
        if (!action) {
          setState('complete');
          return;
        }
        await recordResolvedStudent(resolved, action);
      } catch {
        setResult(null);
        setState('invalid');
      } finally {
        processingRef.current = false;
      }
    },
    [recordResolvedStudent, stopCamera],
  );

  const start = useCallback(async () => {
    stopCamera();
    const cameraRequest = ++cameraRequestRef.current;
    setOpen(true);
    setResult(null);
    setRecordedAction(null);
    setState('starting');

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setState('unsupported');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('no-camera');
      return;
    }
    if (!window.BarcodeDetector) {
      setState('unsupported');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (cameraRequest !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'],
      });
      scanningRef.current = true;
      setState('scanning');

      const scan = async () => {
        if (!scanningRef.current) return;
        const video = videoRef.current;
        try {
          if (video && video.readyState >= 2) {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue?.trim();
            if (raw) {
              void processToken(raw);
            } else {
              clearFrameSinceLastScanRef.current = true;
            }
          }
        } catch {
          // A transient frame decode failure should not stop the camera loop.
        }
        if (scanningRef.current) {
          scanTimerRef.current = window.setTimeout(() => void scan(), 500);
        }
      };

      scanTimerRef.current = window.setTimeout(() => void scan(), 500);
    } catch (error) {
      if (cameraRequest !== cameraRequestRef.current) return;
      stopCamera();
      setState(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'permission-denied'
          : 'no-camera',
      );
    }
  }, [processToken, stopCamera]);

  async function retryRecord() {
    const action = actionForResult(result);
    if (!result || !action || processingRef.current) return;
    processingRef.current = true;
    try {
      await recordResolvedStudent(result, action);
    } finally {
      processingRef.current = false;
    }
  }

  function close() {
    cameraRequestRef.current += 1;
    stopCamera();
    setOpen(false);
    setState('idle');
    setResult(null);
    setRecordedAction(null);
    setManualToken('');
  }

  const activeAction = actionForResult(result);
  const showVideo = state === 'starting' || state === 'scanning';

  return (
    <Card className="border-navy-200 p-5 ring-1 ring-navy-100" data-testid="driver-qr-scanner-card">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Scan student pass</h2>
          <p className="mt-1 text-sm text-gray-600">
            A valid pass records the next allowed pickup or drop-off for this active trip.
          </p>
        </div>

        {!open && (
          <Button
            type="button"
            size="lg"
            fullWidth
            leftIcon={<Camera className="h-5 w-5" aria-hidden />}
            onClick={() => void start()}
            data-testid="driver-open-qr-scanner"
          >
            Open QR scanner
          </Button>
        )}

        {open &&
          createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-pass-scanner-title"
              className="fixed inset-0 z-50 h-[100dvh] overflow-y-auto bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
              data-testid="driver-student-scanner-fullscreen"
            >
              <div className="mx-auto flex min-h-full max-w-3xl flex-col space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="student-pass-scanner-title" className="text-lg font-bold text-navy-900">
                    Scan student pass
                  </h2>
                  <Button type="button" variant="secondary" onClick={close}>
                    Close scanner
                  </Button>
                </div>
                {showVideo && (
                  <div
                    className="relative min-h-48 flex-1 overflow-hidden rounded-xl bg-gray-900"
                    style={{ minHeight: '60dvh' }}
                  >
                    <video
                      ref={videoRef}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted
                      playsInline
                      data-testid="driver-qr-video"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                      <div className="h-40 w-2/3 max-w-sm rounded-2xl border-4 border-white shadow-lg" />
                    </div>
                  </div>
                )}

                {state === 'starting' && (
                  <p className="text-sm text-gray-600">Requesting camera permission...</p>
                )}
                {state === 'scanning' && (
                  <p className="text-sm font-medium text-gray-700">
                    Point the rear camera at one BusSafe student pass.
                  </p>
                )}
                {state === 'resolving' && (
                  <p className="text-sm font-semibold text-navy-700">Checking this pass...</p>
                )}
                {state === 'recording' && activeAction && (
                  <p className="text-sm font-semibold text-navy-700">
                    Recording {actionLabel(activeAction)}...
                  </p>
                )}
                {state === 'permission-denied' && (
                  <p className="text-sm font-semibold text-danger-700">
                    Camera permission was denied. Allow camera access and try again.
                  </p>
                )}
                {state === 'no-camera' && (
                  <p className="text-sm font-semibold text-danger-700">
                    No camera was available in this browser.
                  </p>
                )}
                {state === 'unsupported' && (
                  <p className="text-sm font-semibold text-warning-700">
                    This browser cannot scan QR codes here. Use the BusSafe Android app or a
                    supported secure browser.
                  </p>
                )}
                {state === 'invalid' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-danger-700">
                      This pass could not be verified for the active trip. Nothing was recorded.
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      fullWidth
                      variant="secondary"
                      leftIcon={<RefreshCw className="h-5 w-5" aria-hidden />}
                      onClick={() => void start()}
                      data-testid="driver-qr-retry-scan"
                    >
                      Try scanner again
                    </Button>
                  </div>
                )}

                {(state === 'unsupported' || import.meta.env.DEV) && (
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void processToken(manualToken);
                    }}
                  >
                    <input
                      aria-label="Manual QR token for QA"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                      value={manualToken}
                      onChange={(event) => setManualToken(event.target.value)}
                      placeholder="QA/accessibility token entry"
                    />
                    <Button className="w-full sm:w-auto" type="submit" size="md">
                      Process pass
                    </Button>
                  </form>
                )}

                {result && (
                  <div
                    className={`rounded-xl border p-4 ${
                      state === 'recorded'
                        ? 'border-success-200 bg-success-50'
                        : state === 'record-failed'
                          ? 'border-danger-200 bg-danger-50'
                          : 'border-blue-200 bg-blue-50'
                    }`}
                    data-testid="driver-qr-result"
                  >
                    <div className="flex items-start gap-3">
                      {state === 'recorded' && (
                        <CheckCircle2
                          className="mt-0.5 h-5 w-5 shrink-0 text-success-700"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-navy-900">{result.studentDisplayName}</p>
                        <p className="mt-1 text-sm text-gray-700">
                          Pickup: {result.pickupStopName ?? 'Not assigned'} · Drop-off:{' '}
                          {result.dropoffStopName ?? 'Not assigned'}
                        </p>
                      </div>
                    </div>

                    {state === 'recorded' && recordedAction && (
                      <div className="mt-4 space-y-3">
                        <p
                          className="text-sm font-bold text-success-800"
                          data-testid="driver-qr-recorded-message"
                        >
                          {recordedAction === 'pickup' ? 'Pickup' : 'Drop-off'} recorded.
                        </p>
                        <Button
                          type="button"
                          size="lg"
                          fullWidth
                          variant="success"
                          onClick={() => void start()}
                          data-testid="driver-qr-scan-another"
                        >
                          Scan another pass
                        </Button>
                      </div>
                    )}

                    {state === 'record-failed' && (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm font-bold text-danger-800">
                          This event could not be recorded. The student status was not changed.
                        </p>
                        <Button
                          type="button"
                          size="lg"
                          fullWidth
                          variant="secondary"
                          onClick={() => void retryRecord()}
                          disabled={busyStudentId === result.studentId}
                          data-testid="driver-qr-retry-record"
                        >
                          Try recording again
                        </Button>
                      </div>
                    )}

                    {state === 'complete' && (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm font-semibold text-success-700">
                          Pickup and drop-off are already complete. Nothing was recorded.
                        </p>
                        <Button
                          type="button"
                          size="lg"
                          fullWidth
                          variant="secondary"
                          onClick={() => void start()}
                        >
                          Scan another pass
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </Card>
  );
}
