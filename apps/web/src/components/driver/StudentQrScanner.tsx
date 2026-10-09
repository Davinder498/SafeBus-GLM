import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2 } from 'lucide-react';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  recordStudentQrEvent,
  type StudentQrEventType,
  type StudentQrScanResult,
} from '@/services/studentQrScanService';
import { isLikelyStudentQrToken } from '@/utils/studentQr';
import { createStudentQrDetector } from '@/utils/studentQrDetector';

interface Props {
  tripId: string;
  onRecorded: (result: StudentQrScanResult) => Promise<void>;
}
type ScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'permission-denied'
  | 'no-camera'
  | 'unsupported'
  | 'recording'
  | 'result'
  | 'invalid'
  | 'record-failed'
  | 'paused';
interface PendingScan {
  token: string;
  eventType: StudentQrEventType;
  tripId: string;
}
const label = (event: StudentQrEventType) => (event === 'picked_up' ? 'Pickup' : 'Drop-off');
const PASS_REMOVED_DELAY_MS = 1000;

export function StudentQrScanner({ tripId, onRecorded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const processingRef = useRef(false);
  const pendingRef = useRef<PendingScan | null>(null);
  const lastPassRef = useRef<{ token: string; lastSeenAt: number } | null>(null);
  const autoResumeRef = useRef(false);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScannerState>('idle');
  const [eventType, setEventType] = useState<StudentQrEventType>('picked_up');
  const [result, setResult] = useState<StudentQrScanResult | null>(null);
  const [manualToken, setManualToken] = useState('');

  const stopDetection = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopDetection();
    releaseCamera();
  }, [releaseCamera, stopDetection]);

  useEffect(() => {
    // A different displayed trip invalidates every outstanding scanner callback.
    stopCamera();
    pendingRef.current = null;
    lastPassRef.current = null;
    autoResumeRef.current = false;
    processingRef.current = false;
    setOpen(false);
    setState('idle');
    setResult(null);
    setManualToken('');
    return stopCamera;
  }, [tripId, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.querySelector<HTMLButtonElement>('[data-testid="driver-open-qr-scanner"]')?.focus();
    };
  }, [open]);

  useEffect(() => {
    const pause = () => {
      autoResumeRef.current = false;
      if (processingRef.current) {
        // Release tracks without invalidating the pending server response.
        releaseCamera();
      } else if (state === 'starting' || state === 'scanning' || state === 'result') {
        stopCamera();
        setState('paused');
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
    };
  }, [releaseCamera, stopCamera, state]);

  const submit = useCallback(
    async (pending: PendingScan) => {
      if (processingRef.current) return;
      processingRef.current = true;
      // The camera and decoder stay in one session. The scan loop awaits this
      // request before it reads another frame, so only one event is in flight.
      const generation = generationRef.current;
      pendingRef.current = pending;
      setState('recording');
      try {
        const recorded = await recordStudentQrEvent(
          pending.token,
          pending.eventType,
          pending.tripId,
        );
        if (generation !== generationRef.current) return;
        pendingRef.current = null;
        lastPassRef.current = { token: pending.token, lastSeenAt: Date.now() };
        setResult(recorded);
        const continueScanning =
          recorded.outcome !== 'pickup_required' &&
          autoResumeRef.current &&
          document.visibilityState !== 'hidden';
        if (recorded.outcome === 'pickup_required') {
          releaseCamera();
          setState('result');
        } else {
          setState(continueScanning && streamRef.current ? 'scanning' : 'paused');
        }
        // Do not reinterpret a successful write as failed if the list cannot refresh.
        void onRecorded(recorded).catch(() => undefined);
        return continueScanning;
      } catch {
        if (generation === generationRef.current) {
          releaseCamera();
          setState('record-failed');
        }
      } finally {
        if (generation === generationRef.current) processingRef.current = false;
      }
    },
    [onRecorded, releaseCamera],
  );

  const processToken = useCallback(
    async (raw: string) => {
      if (processingRef.current) return;
      const token = raw.trim();
      if (!isLikelyStudentQrToken(token)) {
        stopCamera();
        setResult(null);
        pendingRef.current = null;
        setState('invalid');
        return;
      }
      await submit({ token, eventType, tripId });
    },
    [eventType, tripId, stopCamera, submit],
  );

  const start = useCallback(async () => {
    if (processingRef.current) return;
    stopDetection();
    const generation = generationRef.current;
    autoResumeRef.current = true;
    pendingRef.current = null;
    setManualToken('');
    setOpen(true);
    setState('starting');
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setState('unsupported');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('no-camera');
      return;
    }
    try {
      const detector = await createStudentQrDetector();
      if (generation !== generationRef.current) return;
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        }));
      if (generation !== generationRef.current || document.visibilityState === 'hidden') {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      // React must mount the video before an immediately resolved camera promise
      // attaches its stream (also applies to camera mocks and fast WebViews).
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (generation !== generationRef.current) return;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (generation !== generationRef.current) return;
      setState('scanning');
      const scan = async () => {
        if (generation !== generationRef.current) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (generation !== generationRef.current) return;
            const value = codes[0]?.rawValue;
            if (value) {
              if (lastPassRef.current?.token === value.trim()) {
                lastPassRef.current.lastSeenAt = Date.now();
              } else {
                await processToken(value);
              }
            } else if (
              lastPassRef.current &&
              Date.now() - lastPassRef.current.lastSeenAt >= PASS_REMOVED_DELAY_MS
            ) {
              lastPassRef.current = null;
            }
          }
        } catch {
          /* Frame decode failures do not stop the camera. */
        }
        if (generation === generationRef.current && streamRef.current && autoResumeRef.current)
          timerRef.current = window.setTimeout(() => void scan(), 350);
      };
      timerRef.current = window.setTimeout(() => void scan(), 350);
    } catch (error) {
      if (generation !== generationRef.current) return;
      stopCamera();
      setState(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'permission-denied'
          : 'no-camera',
      );
    }
  }, [processToken, stopCamera, stopDetection]);

  function pauseScanning() {
    autoResumeRef.current = false;
    stopCamera();
    setState('paused');
  }

  function close() {
    stopCamera();
    pendingRef.current = null;
    lastPassRef.current = null;
    autoResumeRef.current = false;
    processingRef.current = false;
    setOpen(false);
    setState('idle');
    setResult(null);
    setManualToken('');
  }

  const busy = state === 'recording' || state === 'starting' || state === 'scanning';
  const mode = (
    <fieldset
      disabled={busy || state === 'record-failed'}
      className="flex gap-3"
      data-testid="driver-qr-mode"
    >
      <legend className="mb-2 text-sm font-semibold">Scan mode</legend>
      {(['picked_up', 'dropped_off'] as const).map((value) => (
        <label
          key={value}
          className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border p-3 font-semibold"
        >
          <input
            type="radio"
            name="student-qr-mode"
            value={value}
            checked={eventType === value}
            onChange={() => {
              autoResumeRef.current = false;
              stopCamera();
              lastPassRef.current = null;
              setEventType(value);
              setResult(null);
              setState('idle');
            }}
          />
          {label(value)}
        </label>
      ))}
    </fieldset>
  );

  function outcomeMessage() {
    if (result?.outcome === 'recorded') return `${label(eventType)} recorded.`;
    if (result?.outcome === 'already_recorded')
      return `${label(eventType)} already recorded. Nothing new was recorded.`;
    if (result?.outcome === 'pickup_required')
      return 'Pickup must be recorded before drop-off. Nothing was recorded.';
    return 'Pickup and drop-off are complete. Nothing new was recorded.';
  }

  return (
    <Card className="p-5" data-testid="driver-qr-scanner-card">
      <h2 className="text-lg font-bold text-navy-900">Scan student pass</h2>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        Choose a mode. Each valid QR records that event for this active trip.
      </p>
      {!open && (
        <>
          {mode}
          <button
            ref={openButtonRef}
            type="button"
            className={`${buttonClass({ size: 'lg' })} mt-4 w-full`}
            onClick={() => void start()}
            data-testid="driver-open-qr-scanner"
          >
            <Camera className="h-5 w-5" aria-hidden />
            Open QR scanner
          </button>
        </>
      )}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-pass-scanner-title"
            className="fixed inset-0 z-50 h-[100dvh] overflow-y-auto bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
            data-testid="driver-student-scanner-fullscreen"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && state !== 'recording') close();
              if (event.key === 'Tab') {
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled)',
                  ),
                ).filter((control) => !control.closest('fieldset:disabled'));
                const first = controls[0];
                const last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                }
                if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <h2 id="student-pass-scanner-title" className="text-lg font-bold">
                  {label(eventType)} — scan student pass
                </h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className={buttonClass({ variant: 'secondary' })}
                  disabled={state === 'recording'}
                  onClick={close}
                >
                  Close scanner
                </button>
              </div>
              {mode}
              {(['starting', 'scanning', 'recording', 'result'] as ScannerState[]).includes(
                state,
              ) && (
                <div
                  className="relative min-h-48 flex-1 overflow-hidden rounded-xl bg-gray-900"
                  style={{ minHeight: '36dvh' }}
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
                    <div className="h-48 w-2/3 max-w-sm rounded-2xl border-4 border-white" />
                  </div>
                </div>
              )}
              <div role="status" aria-live="polite">
                {state === 'starting' && <p>Requesting camera access...</p>}
                {state === 'scanning' && (
                  <p>Ready for the next student. Show one pass at a time.</p>
                )}
                {state === 'recording' && <p>Recording {label(eventType).toLowerCase()}...</p>}
                {state === 'permission-denied' && (
                  <p>Camera permission was denied. Allow camera access and try again.</p>
                )}
                {state === 'no-camera' && (
                  <p>No camera is available. Check camera access and try again.</p>
                )}
                {state === 'unsupported' && (
                  <p>A secure connection is required to scan student passes.</p>
                )}
                {state === 'paused' && <p>Camera paused. Start camera when ready to continue.</p>}
                {state === 'invalid' && (
                  <p>This is not a BusSafe student QR pass. Nothing was recorded.</p>
                )}
                {state === 'record-failed' && (
                  <p>
                    Could not confirm this scan. It may already have been recorded. Retry the same
                    event; repeated scans will not create duplicates.
                  </p>
                )}
              </div>
              {result && (
                <div
                  className="rounded-xl border border-blue-200 bg-blue-50 p-4"
                  data-testid="driver-qr-result"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Last scan</p>
                  <p className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                    {result.studentDisplayName}
                  </p>
                  <p className="mt-1 text-sm">
                    Pickup: {result.pickupStopName ?? 'Not assigned'} · Drop-off:{' '}
                    {result.dropoffStopName ?? 'Not assigned'}
                  </p>
                  <p className="mt-3 font-semibold" data-testid="driver-qr-recorded-message">
                    {outcomeMessage()}
                  </p>
                </div>
              )}
              {state === 'record-failed' && (
                <Button
                  onClick={async () => {
                    const pending = pendingRef.current;
                    if (pending && (await submit(pending))) void start();
                  }}
                  data-testid="driver-qr-retry-record"
                >
                  Retry same event
                </Button>
              )}
              {(state === 'starting' || state === 'scanning' || state === 'result') && (
                <Button variant="secondary" onClick={pauseScanning}>
                  Pause scanning
                </Button>
              )}
              {[
                'idle',
                'paused',
                'invalid',
                'permission-denied',
                'no-camera',
                'unsupported',
                'result',
              ].includes(state) && (
                <Button
                  size="lg"
                  fullWidth
                  onClick={() => void start()}
                  data-testid="driver-qr-start-camera"
                >
                  Start camera
                </Button>
              )}
              {import.meta.env.DEV && !busy && state !== 'record-failed' && (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void processToken(manualToken);
                  }}
                >
                  <input
                    aria-label="Manual QR token for QA"
                    className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2"
                    value={manualToken}
                    onChange={(event) => setManualToken(event.target.value)}
                    placeholder="QA token entry"
                    autoComplete="off"
                  />
                  <Button type="submit">Process pass</Button>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </Card>
  );
}
