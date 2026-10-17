import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  manage: vi.fn(),
  printable: vi.fn(),
  image: vi.fn(),
}));
vi.mock('@/services/busQrCredentialService', () => ({
  fetchBusQrCredentialStatus: mocks.status,
  manageBusQrCredential: mocks.manage,
}));
vi.mock('@/services/qrPrintService', () => ({
  getPrintableQr: mocks.printable,
  readOriginalQrImage: vi.fn(),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.image } }));
import { BusQrCredentialPanel } from './BusQrCredentialPanel';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
async function render(id = 'bus') {
  await act(async () =>
    root.render(
      <StrictMode>
        <BusQrCredentialPanel busId={id} busNumber="B1" />
      </StrictMode>,
    ),
  );
}
async function click(text: string) {
  const b = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!b) throw new Error('Missing ' + text);
  await act(async () => b.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ hasActiveCredential: false });
  mocks.manage.mockResolvedValue({ status: 'active', rawToken: 'same' });
  mocks.printable.mockResolvedValue({ status: 'ready', token: 'same', credentialId: 'original' });
  mocks.image.mockResolvedValue('data:image/png;base64,same');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it('provides a PNG and can retrieve the same QR again after dismissing the issued image', async () => {
  await render();
  await click('Generate QR');
  expect(container.querySelector('a[download]')?.getAttribute('href')).toBe(
    'data:image/png;base64,same',
  );
  await click('Done');
  expect(container.querySelector('img')).toBeNull();
  await click('View / download existing QR');
  expect(mocks.manage).toHaveBeenCalledTimes(1);
  expect(mocks.printable).toHaveBeenCalledWith('bus', 'bus', expect.any(Object));
  expect(container.querySelector('img')?.src).toBe('data:image/png;base64,same');
});
it('requires a separate confirmation before deliberately replacing a code', async () => {
  mocks.status.mockResolvedValue({ hasActiveCredential: true });
  await render();
  await click('Replace QR');
  expect(mocks.manage).not.toHaveBeenCalled();
  await click('Replace code');
  expect(mocks.manage).toHaveBeenCalledWith('bus', 'rotate');
});
it('does not enable issuance when status verification fails', async () => {
  mocks.status.mockRejectedValue(new Error('backend private detail'));
  await render();
  expect(container.querySelector('button')?.disabled).toBe(true);
  expect(container.textContent).not.toContain('backend private detail');
});
it('cannot display an image for a previous bus after an in-flight request completes', async () => {
  let resolve!: (v: unknown) => void;
  mocks.manage.mockReturnValue(new Promise((r) => (resolve = r)));
  await render();
  await click('Generate QR');
  await render('different');
  await act(async () => resolve({ status: 'active', rawToken: 'old' }));
  expect(container.querySelector('img')).toBeNull();
});
