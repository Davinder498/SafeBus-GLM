import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentQrScanner } from './StudentQrScanner';

const mocks = vi.hoisted(() => ({ record: vi.fn(), detector: vi.fn(), detect: vi.fn() }));
vi.mock('@/services/studentQrScanService', () => ({ recordStudentQrEvent: mocks.record }));
vi.mock('@/utils/studentQrDetector', () => ({ createStudentQrDetector: mocks.detector }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const token = `sbus_qr_v1_${'A'.repeat(43)}`;
const recorded = {
  studentId: 'student-1',
  studentDisplayName: 'Avery Johnson',
  pickupStopName: 'Elm',
  dropoffStopName: 'School',
  studentTripStatus: 'picked_up',
  outcome: 'recorded',
};
let root: Root;
let container: HTMLDivElement;
let stops: ReturnType<typeof vi.fn>;
let camera: ReturnType<typeof vi.fn>;
let refreshed: ReturnType<typeof vi.fn>;

function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Button missing: ${text}`);
  return found;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function tick(ms = 500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function render(tripId = 'trip-1') {
  await act(async () => root.render(<StudentQrScanner tripId={tripId} onRecorded={refreshed} />));
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stops = vi.fn();
  camera = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stops }] });
  refreshed = vi.fn().mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(recorded);
  mocks.detector.mockResolvedValue({ detect: mocks.detect });
  mocks.detect.mockResolvedValue([{ rawValue: token }]);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: camera },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 1),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('explicit student QR events', () => {
  it('automatically scans successive students and suppresses a pass held in view', async () => {
    await click('Open QR scanner');
    await tick();
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(token, 'picked_up', 'trip-1');
    expect(stops).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Pickup recorded.');
    await tick(5000);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Ready for the next student');
    const nextToken = `sbus_qr_v1_${'B'.repeat(43)}`;
    mocks.detect.mockResolvedValue([{ rawValue: nextToken }]);
    await tick();
    expect(mocks.record).toHaveBeenLastCalledWith(nextToken, 'picked_up', 'trip-1');
    expect(mocks.record).toHaveBeenCalledTimes(2);
    expect(camera).toHaveBeenCalledTimes(1);
    await tick(2000);
    mocks.detect.mockResolvedValue([]);
    await tick(1500);
    mocks.record.mockResolvedValue({ ...recorded, outcome: 'already_recorded' });
    mocks.detect.mockResolvedValue([{ rawValue: nextToken }]);
    await tick();
    expect(mocks.record).toHaveBeenLastCalledWith(nextToken, 'picked_up', 'trip-1');
    expect(document.body.textContent).toContain('Pickup already recorded.');
    expect(camera).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  });

  it('uses Drop-off only after an explicit mode selection', async () => {
    await act(async () =>
      (document.querySelector('input[value="dropped_off"]') as HTMLInputElement).click(),
    );
    mocks.record.mockResolvedValue({ ...recorded, studentTripStatus: 'dropped_off' });
    await click('Open QR scanner');
    await tick();
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(token, 'dropped_off', 'trip-1');
    expect(document.body.textContent).toContain('Drop-off recorded.');
    await tick(2000);
    const nextToken = `sbus_qr_v1_${'B'.repeat(43)}`;
    mocks.detect.mockResolvedValue([{ rawValue: nextToken }]);
    await tick();
    expect(mocks.record).toHaveBeenLastCalledWith(nextToken, 'dropped_off', 'trip-1');
  });

  it.each(['pickup_required', 'complete'])(
    'shows %s without inventing a successful event',
    async (outcome) => {
      mocks.record.mockResolvedValue({ ...recorded, outcome });
      await click('Open QR scanner');
      await tick();
      expect(document.body.textContent).not.toContain('Pickup recorded.');
      expect(document.body.textContent).toContain('Nothing');
    },
  );

  it('retries the same token, event and trip after an uncertain response', async () => {
    mocks.record
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ ...recorded, outcome: 'already_recorded' });
    await click('Open QR scanner');
    await tick();
    expect(document.body.textContent).toContain('It may already have been recorded');
    await tick(3000);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(
      (document.querySelector('input[value="dropped_off"]') as HTMLInputElement).closest('fieldset')
        ?.disabled,
    ).toBe(true);
    await click('Retry same event');
    expect(mocks.record.mock.calls).toEqual([
      [token, 'picked_up', 'trip-1'],
      [token, 'picked_up', 'trip-1'],
    ]);
    expect(document.body.textContent).toContain('Pickup already recorded.');
  });

  it('preserves confirmed success when the manifest refresh fails', async () => {
    refreshed.mockRejectedValue(new Error('refresh failed'));
    await click('Open QR scanner');
    await tick();
    expect(document.body.textContent).toContain('Pickup recorded.');
    expect(document.body.textContent).not.toContain('Could not confirm');
    await tick(2000);
    mocks.detect.mockResolvedValue([{ rawValue: `sbus_qr_v1_${'B'.repeat(43)}` }]);
    await tick();
    expect(mocks.record).toHaveBeenCalledTimes(2);
  });

  it('rejects bus tokens before any write', async () => {
    mocks.detect.mockResolvedValue([{ rawValue: 'bus-qr-token' }]);
    await click('Open QR scanner');
    await tick();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('not a BusSafe student QR');
  });

  it('handles camera permission denial', async () => {
    camera.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await click('Open QR scanner');
    await tick();
    expect(document.body.textContent).toContain('Camera permission was denied');
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('stops the camera on backgrounding and resumes only on request', async () => {
    mocks.detect.mockResolvedValue([]);
    await click('Open QR scanner');
    await tick(50);
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(stops).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Camera paused');
    await tick(5000);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(camera).toHaveBeenCalledTimes(1);
  });

  it('still shows an in-flight server result after backgrounding', async () => {
    let finish!: (value: typeof recorded) => void;
    mocks.record.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await click('Open QR scanner');
    await tick();
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      finish(recorded);
    });
    expect(document.body.textContent).toContain('Pickup recorded.');
    await tick(3000);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(stops).toHaveBeenCalledTimes(1);
  });

  it('discards callbacks from a previous trip and stops its stream', async () => {
    mocks.detect.mockResolvedValue([]);
    await click('Open QR scanner');
    await tick(50);
    await render('trip-2');
    expect(stops).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    mocks.detect.mockResolvedValue([{ rawValue: token }]);
    await click('Open QR scanner');
    await tick();
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(token, 'picked_up', 'trip-2');
  });

  it('releases a late camera permission result after closing', async () => {
    let finish!: (value: unknown) => void;
    camera.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await click('Open QR scanner');
    await click('Close scanner');
    await act(async () => finish({ getTracks: () => [{ stop: stops }] }));
    expect(stops).toHaveBeenCalledTimes(1);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('does not read another pass while recording is pending', async () => {
    let finish!: (value: typeof recorded) => void;
    mocks.record.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await click('Open QR scanner');
    await tick();
    mocks.detect.mockResolvedValue([{ rawValue: `sbus_qr_v1_${'B'.repeat(43)}` }]);
    await tick(3000);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.detect).toHaveBeenCalledTimes(1);
    await act(async () => finish(recorded));
    await tick(1500);
    expect(mocks.record).toHaveBeenCalledTimes(2);
  });

  it('cancels automatic resumption when closed after success', async () => {
    await click('Open QR scanner');
    await tick();
    await click('Close scanner');
    await tick(3000);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(stops).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('allows pausing the line and changing the event mode', async () => {
    mocks.detect.mockResolvedValue([]);
    await click('Open QR scanner');
    await tick();
    await click('Pause scanning');
    expect(stops).toHaveBeenCalledTimes(1);
    await act(async () =>
      (document.querySelector('input[value="dropped_off"]') as HTMLInputElement).click(),
    );
    await tick(2000);
    expect(camera).toHaveBeenCalledTimes(1);
    mocks.detect.mockResolvedValue([{ rawValue: token }]);
    await click('Start camera');
    await tick();
    expect(mocks.record).toHaveBeenCalledWith(token, 'dropped_off', 'trip-1');
  });

  it('pauses ordering errors instead of silently skipping a missing pickup', async () => {
    mocks.record.mockResolvedValue({ ...recorded, outcome: 'pickup_required' });
    await click('Open QR scanner');
    await tick(3000);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(stops).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Pickup must be recorded');
  });
});
