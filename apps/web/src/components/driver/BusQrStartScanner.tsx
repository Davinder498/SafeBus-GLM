import { useCallback, useEffect, useRef, useState } from 'react';
import { Bus, Camera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { startBusTrackingFromQr, type BusTrackingStartResult } from '@/services/busTrackingService';
import { isLikelyBusQrToken } from '@/utils/busQr';

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

type ScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'permission-denied'
  | 'no-camera'
  | 'unsupported'
  | 'checking-location'
  | 'starting-trip'
  | 'started'
  | 'invalid';

export function BusQrStartScanner({
  hasActiveTrip,
  onStarted,
}: {
  hasActiveTrip: boolean;
  onStarted: (result: BusTrackingStartResult) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const processingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScannerState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const processToken = useCallback(
    async (rawToken: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      stopCamera();
      setMessage(null);
      if (!isLikelyBusQrToken(rawToken)) {
        setState('invalid');
        setMessage('This is not a valid SafeBus vehicle QR.');
        processingRef.current = false;
        return;
      }
      try {
        if (!('geolocation' in navigator)) {
          throw new Error('Location is not available on this phone. The bus was not started.');
        }
        setState('checking-location');
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            (error) => {
              reject(
                new Error(
                  error.code === error.PERMISSION_DENIED
                    ? 'Location permission is required. The bus was not started.'
                    : 'A GPS location could not be confirmed. The bus was not started.',
                ),
              );
            },
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
          );
        });
        setState('starting-trip');
        const result = await startBusTrackingFromQr(rawToken);
        setState('started');
        setMessage(
          result.resumed
            ? `Bus ${result.busNumber} tracking resumed on this phone.`
            : `Bus ${result.busNumber} started. This phone is now sharing its location.`,
        );
        await onStarted(result);
      } catch (cause) {
        setState('invalid');
        setMessage(cause instanceof Error ? cause.message : 'The bus could not be started.');
      } finally {
        processingRef.current = false;
      }
    },
    [onStarted, stopCamera],
  );

  const start = useCallback(async () => {
    stopCamera();
    setOpen(true);
    setMessage(null);
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
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanningRef.current = true;
      setState('scanning');
      const scanFrame = async () => {
        if (!scanningRef.current) return;
        try {
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              void processToken(value);
              return;
            }
          }
        } catch {
          // A transient decode error should not close the scanner.
        }
        if (scanningRef.current) timerRef.current = window.setTimeout(() => void scanFrame(), 500);
      };
      timerRef.current = window.setTimeout(() => void scanFrame(), 500);
    } catch (cause) {
      stopCamera();
      setState(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'permission-denied'
          : 'no-camera',
      );
    }
  }, [processToken, stopCamera]);

  function close() {
    stopCamera();
    setOpen(false);
    setState('idle');
    setMessage(null);
    setManualToken('');
  }

  return (
    <Card className="border-blue-200 p-5 ring-1 ring-blue-100" data-testid="driver-bus-qr-scanner">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
            <Bus className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-navy-900">
              {hasActiveTrip ? 'Resume this bus GPS' : 'Scan to start the bus'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Scan the QR mounted inside the bus. SafeBus will identify its prepared run and use
              this phone as the bus GPS.
            </p>
          </div>
        </div>

        {!open && (
          <Button
            type="button"
            size="lg"
            fullWidth
            leftIcon={<Camera className="h-5 w-5" />}
            onClick={() => void start()}
            data-testid="driver-scan-bus-qr"
          >
            {hasActiveTrip ? 'Scan bus QR to resume GPS' : 'Scan bus QR to start'}
          </Button>
        )}

        {open && (
          <div className="space-y-4">
            {(state === 'starting' || state === 'scanning') && (
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full rounded-xl bg-gray-900"
                data-testid="driver-bus-qr-video"
              />
            )}
            {state === 'starting' && (
              <p className="text-sm text-gray-600">Requesting camera permission...</p>
            )}
            {state === 'scanning' && (
              <p className="text-sm font-semibold text-gray-700">
                Point the rear camera at the QR inside the bus.
              </p>
            )}
            {state === 'checking-location' && (
              <p className="text-sm font-semibold text-blue-700">
                Confirming location permission before starting the bus...
              </p>
            )}
            {state === 'starting-trip' && (
              <p className="text-sm font-semibold text-blue-700">
                Connecting this phone to the bus...
              </p>
            )}
            {state === 'permission-denied' && (
              <p className="text-sm font-semibold text-danger-700">Camera permission was denied.</p>
            )}
            {state === 'no-camera' && (
              <p className="text-sm font-semibold text-danger-700">
                No camera is available on this device.
              </p>
            )}
            {state === 'unsupported' && (
              <p className="text-sm font-semibold text-warning-700">
                Use the SafeBus Android app or enter the QR token for testing.
              </p>
            )}
            {message && (
              <p
                role={state === 'invalid' ? 'alert' : 'status'}
                className={`text-sm font-semibold ${state === 'invalid' ? 'text-danger-700' : 'text-success-700'}`}
              >
                {message}
              </p>
            )}

            {(state === 'unsupported' || import.meta.env.DEV) && state !== 'started' && (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void processToken(manualToken);
                }}
              >
                <input
                  aria-label="Manual bus QR token for QA"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  placeholder="QA token entry"
                />
                <Button type="submit">Connect</Button>
              </form>
            )}

            {state === 'invalid' && (
              <Button
                type="button"
                size="lg"
                fullWidth
                variant="secondary"
                leftIcon={<RefreshCw className="h-5 w-5" />}
                onClick={() => void start()}
              >
                Try again
              </Button>
            )}
            <Button type="button" fullWidth variant="ghost" onClick={close}>
              Close scanner
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
