export interface StudentQrDetector {
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

/** The fallback decodes local video frames; it never requests media or uploads images. */
export async function createStudentQrDetector(): Promise<StudentQrDetector> {
  if (window.BarcodeDetector) {
    try {
      return new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      // Some WebViews expose BarcodeDetector but cannot construct a QR detector.
    }
  }
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const reader = new BrowserQRCodeReader();
  return {
    async detect(video) {
      try {
        return [{ rawValue: reader.decode(video).getText() }];
      } catch {
        // A frame without a readable QR is normal, including motion-blurred frames.
        return [];
      }
    },
  };
}
