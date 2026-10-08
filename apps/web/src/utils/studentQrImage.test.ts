// @vitest-environment node
import { expect, it } from 'vitest';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';

it('round-trips the printable PNG through an independent QR decoder', async () => {
  const token = `sbus_qr_v1_${'A'.repeat(43)}`;
  const image = await QRCode.toDataURL(token, { width: 640, margin: 4, errorCorrectionLevel: 'M' });
  const png = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) luminance[pixel] = png.data[pixel * 4];
  const decoded = new QRCodeReader().decode(
    new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height))),
  );
  expect(decoded.getText()).toBe(token);
});
