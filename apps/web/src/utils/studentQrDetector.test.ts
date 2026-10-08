import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStudentQrDetector } from './studentQrDetector';
const mocks = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    decode = mocks.decode;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('student QR camera decoder', () => {
  it('uses the native QR-only detector when available', async () => {
    const detector = { detect: vi.fn() };
    const constructor = vi.fn(function () {
      return detector;
    });
    vi.stubGlobal('BarcodeDetector', constructor);
    expect(await createStudentQrDetector()).toBe(detector);
    expect(constructor).toHaveBeenCalledWith({ formats: ['qr_code'] });
  });
  it.each(['absent', 'unsupported'])(
    'decodes with ZXing when native detection is %s',
    async (mode) => {
      vi.stubGlobal(
        'BarcodeDetector',
        mode === 'absent'
          ? undefined
          : class {
              constructor() {
                throw new Error('unsupported');
              }
            },
      );
      mocks.decode.mockReturnValue({ getText: () => 'student-token' });
      const detector = await createStudentQrDetector();
      const video = document.createElement('video');
      expect(await detector.detect(video)).toEqual([{ rawValue: 'student-token' }]);
      expect(mocks.decode).toHaveBeenCalledWith(video);
      mocks.decode.mockImplementation(() => {
        throw new Error('No QR in this frame');
      });
      expect(await detector.detect(video)).toEqual([]);
    },
  );
});
