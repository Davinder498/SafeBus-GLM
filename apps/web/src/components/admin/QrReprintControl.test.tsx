import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), image: vi.fn(), onImage: vi.fn() }));
vi.mock('@/services/qrPrintService', () => ({
  getPrintableQr: mocks.get,
  readOriginalQrImage: mocks.read,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.image } }));
import { QrReprintControl } from './QrReprintControl';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.image.mockResolvedValue('data:image/png;base64,same');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(id = 'student') {
  await act(async () =>
    root.render(<QrReprintControl kind="student" entityId={id} onImage={mocks.onImage} />),
  );
}
it('loads and encodes the same active token without issuance or rotation', async () => {
  mocks.get.mockResolvedValue({ status: 'ready', token: 'unchanged', credentialId: 'same' });
  await render();
  await act(async () => container.querySelector('button')!.click());
  expect(mocks.get).toHaveBeenCalledWith(
    'student',
    'student',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(mocks.image).toHaveBeenCalledWith('unchanged', expect.any(Object));
  expect(mocks.onImage).toHaveBeenLastCalledWith('data:image/png;base64,same');
});
it('offers local original-image recovery for a legacy credential', async () => {
  mocks.get
    .mockResolvedValueOnce({ status: 'needs_original', token: null, credentialId: 'old' })
    .mockResolvedValueOnce({ status: 'ready', token: 'original', credentialId: 'old' });
  mocks.read.mockResolvedValue('original');
  await render();
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('same code stays valid');
  const input = container.querySelector('input')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['png'], 'original.png', { type: 'image/png' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(mocks.get).toHaveBeenLastCalledWith(
    'student',
    'student',
    expect.objectContaining({ originalToken: 'original' }),
  );
  expect(mocks.onImage).toHaveBeenLastCalledWith('data:image/png;base64,same');
});
it('does not expose an old record image after navigation during a request', async () => {
  let resolve!: (v: unknown) => void;
  mocks.get.mockReturnValue(new Promise((r) => (resolve = r)));
  await render();
  await act(async () => container.querySelector('button')!.click());
  await render('different');
  await act(async () => resolve({ status: 'ready', token: 'old', credentialId: 'old' }));
  expect(mocks.onImage).not.toHaveBeenCalledWith('data:image/png;base64,same');
});
