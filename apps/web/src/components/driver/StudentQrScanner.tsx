import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { resolveStudentQrForActiveTrip, type StudentQrScanResult } from '@/services/studentQrScanService';
import { isLikelyStudentQrToken, shouldProcessScan } from '@/utils/studentQr';

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>; };
declare global { interface Window { BarcodeDetector?: BarcodeDetectorConstructor } }

interface Props { onConfirm: (studentId: string, action: 'pickup' | 'dropoff') => Promise<void>; busyStudentId: string | null }

export function StudentQrScanner({ onConfirm, busyStudentId }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ value: string | null; at: number }>({ value: null, at: 0 });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'permission-denied' | 'no-camera' | 'unsupported' | 'resolved' | 'invalid'>('idle');
  const [result, setResult] = useState<StudentQrScanResult | null>(null);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function start() {
    setOpen(true); setResult(null); setState('starting');
    if (!window.isSecureContext && window.location.hostname !== 'localhost') { setState('unsupported'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('no-camera'); return; }
    if (!window.BarcodeDetector) { setState('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setState('scanning');
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const scan = async () => {
        if (!streamRef.current || state === 'resolved') return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue?.trim();
          if (raw) void processToken(raw);
        }
        if (streamRef.current) window.setTimeout(scan, 500);
      };
      window.setTimeout(scan, 500);
    } catch (error) {
      setState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'permission-denied' : 'no-camera');
    }
  }

  async function processToken(token: string) {
    const now = Date.now();
    if (!shouldProcessScan(lastRef.current.value, token, lastRef.current.at, now)) return;
    lastRef.current = { value: token, at: now };
    if (!isLikelyStudentQrToken(token)) { setState('invalid'); return; }
    stopCamera();
    try { setResult(await resolveStudentQrForActiveTrip(token)); setState('resolved'); }
    catch { setState('invalid'); }
  }

  const nextAction = result?.nextEventType === 'picked_up' ? 'pickup' : result?.nextEventType === 'dropped_off' ? 'dropoff' : null;

  return <Card className="p-5" data-testid="driver-qr-scanner-card"><div className="space-y-4">
    <div><h2 className="text-lg font-bold text-navy-900">Scan student QR badge</h2><p className="text-sm text-gray-600">Scanning identifies a badge only. The active trip and event rules are verified server-side.</p></div>
    {!open && <Button type="button" onClick={() => void start()} data-testid="driver-open-qr-scanner">Open scanner</Button>}
    {open && <div className="space-y-3">
      <video ref={videoRef} className="aspect-video w-full rounded-lg bg-gray-900" muted playsInline data-testid="driver-qr-video" />
      {state === 'starting' && <p className="text-sm text-gray-600">Requesting camera permission…</p>}
      {state === 'scanning' && <p className="text-sm text-gray-600">Point the rear camera at the SafeBus QR badge.</p>}
      {state === 'permission-denied' && <p className="text-sm font-semibold text-danger-700">Camera permission was denied. Allow camera access and try again.</p>}
      {state === 'no-camera' && <p className="text-sm font-semibold text-danger-700">No camera was available in this browser.</p>}
      {state === 'unsupported' && <p className="text-sm font-semibold text-warning-700">This browser cannot scan QR codes here. Use HTTPS and a browser with BarcodeDetector support.</p>}
      {state === 'invalid' && <p className="text-sm font-semibold text-danger-700">Badge could not be verified for this active trip.</p>}
      {(state === 'unsupported' || import.meta.env.DEV) && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void processToken(manualToken); }}><input aria-label="Manual QR token for QA" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="QA/accessibility token entry" /><Button type="submit" size="sm">Resolve</Button></form>}
      {result && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4" data-testid="driver-qr-confirmation"><p className="font-bold text-navy-900">{result.studentDisplayName}</p><p className="text-sm text-gray-700">{result.message}</p><p className="mt-1 text-xs text-gray-600">Pickup: {result.pickupStopName ?? 'Not assigned'} · Drop-off: {result.dropoffStopName ?? 'Not assigned'}</p>{nextAction ? <Button type="button" className="mt-3" disabled={busyStudentId === result.studentId} onClick={() => onConfirm(result.studentId, nextAction)} data-testid="driver-qr-confirm-event">Confirm {nextAction === 'pickup' ? 'pickup' : 'drop-off'}</Button> : <p className="mt-3 text-sm font-semibold text-success-700">Trip events complete.</p>}</div>}
      <Button type="button" variant="ghost" onClick={() => { stopCamera(); setOpen(false); setState('idle'); }} data-testid="driver-close-qr-scanner">Close scanner</Button>
    </div>}
  </div></Card>;
}
