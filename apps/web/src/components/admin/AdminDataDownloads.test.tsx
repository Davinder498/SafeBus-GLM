import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'admin' },
    profile: { tenant_id: 'tenant', role: 'tenant_admin', status: 'active' },
  },
  collect: vi.fn(),
  verify: vi.fn(),
  download: vi.fn(),
  qr: vi.fn(),
  image: vi.fn(),
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/services/adminDownloadService', () => ({
  collectDownloadRecords: mocks.collect,
  verifyDownloadContext: mocks.verify,
}));
vi.mock('@/utils/dataDownloads', () => ({ downloadCsv: mocks.download }));
vi.mock('@/services/qrPrintService', () => ({ getPrintableQr: mocks.qr }));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.image } }));
import { AdminDataDownloads } from './AdminDataDownloads';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminDataDownloads
          entity="students"
          query={{ search: 'Avery', status: 'active', schoolId: null }}
        />
      </MemoryRouter>,
    ),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!button) throw new Error('Missing ' + text);
  await act(async () => button.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.profile = { tenant_id: 'tenant', role: 'tenant_admin', status: 'active' };
  mocks.collect.mockResolvedValue([
    {
      id: 'student',
      tenant_id: 'tenant',
      first_name: 'Avery',
      last_name: 'Johnson',
      status: 'active',
    },
  ]);
  mocks.qr.mockResolvedValue({ status: 'ready', token: 'same-token', credentialId: 'same-id' });
  mocks.image.mockResolvedValue('data:image/png;base64,example');
  mocks.verify.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.classList.remove('printing-qr-batch');
  vi.restoreAllMocks();
});
it('downloads all matching CSV rows and shows the count', async () => {
  await render();
  await click('Download CSV');
  expect(mocks.collect).toHaveBeenCalledWith(
    'students',
    { search: 'Avery', status: 'active', schoolId: null },
    { userId: 'admin', tenantId: 'tenant' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(mocks.download).toHaveBeenCalledWith(
    'students',
    expect.arrayContaining([expect.objectContaining({ id: 'student' })]),
  );
  expect(container.textContent).toContain('Downloaded 1 students.');
});
it('does not create a partial download on failure', async () => {
  mocks.collect.mockRejectedValue(new Error('List changed.'));
  await render();
  await click('Download CSV');
  expect(mocks.download).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('List changed.');
});
it('ignores a late response after cancellation', async () => {
  let resolve!: (value: unknown[]) => void;
  mocks.collect.mockReturnValue(new Promise((r) => (resolve = r)));
  await render();
  await click('Download CSV');
  await click('Cancel download');
  await act(async () => resolve([]));
  expect(mocks.download).not.toHaveBeenCalled();
});
it('clears an in-progress download on tenant change and hides controls from other roles', async () => {
  let resolve!: (value: unknown[]) => void;
  mocks.collect.mockReturnValue(new Promise((r) => (resolve = r)));
  await render();
  await click('Download CSV');
  mocks.auth.profile = { tenant_id: 'other', role: 'guardian', status: 'active' };
  await render();
  await act(async () => resolve([]));
  expect(mocks.download).not.toHaveBeenCalled();
  expect(container.querySelector('button')).toBeNull();
});
it('prepares printable sheets using stable credentials and only explicit missing-code issuance', async () => {
  await render();
  await click('Prepare QR sheets');
  expect(mocks.qr).not.toHaveBeenCalled();
  await click('Prepare sheets');
  expect(mocks.qr).toHaveBeenCalledWith(
    'student',
    'student',
    expect.objectContaining({ issueMissing: true, signal: expect.any(AbortSignal) }),
  );
  expect(container.textContent).toContain('1 QR codes ready');
  expect(document.querySelector('.qr-batch-print-page')?.textContent).toContain('Avery J.');
  expect(document.body.textContent).not.toContain('same-token');
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  await click('Print QR sheets');
  expect(print).toHaveBeenCalledOnce();
  await click('Dismiss QR sheets');
  expect(document.querySelector('.qr-batch-print-root')).toBeNull();
});
it('lists legacy originals without replacing or printing a different code', async () => {
  mocks.qr.mockResolvedValue({ status: 'needs_original', token: null, credentialId: 'legacy' });
  await render();
  await click('Prepare QR sheets');
  await click('Prepare sheets');
  expect(container.textContent).toContain('1 need an original image');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/students/student');
  expect(mocks.image).not.toHaveBeenCalled();
  expect(document.querySelector('.qr-batch-print-root')).toBeNull();
});
it('blocks incomplete bus sheets until every existing code can be reprinted', async () => {
  mocks.collect.mockResolvedValue([
    { id: 'bus-a', bus_number: '1', status: 'active' },
    { id: 'bus-b', bus_number: '2', status: 'active' },
  ]);
  mocks.qr.mockResolvedValueOnce({ status: 'ready', token: 'original-a' });
  mocks.qr.mockResolvedValueOnce({ status: 'needs_original', token: null });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminDataDownloads entity="buses" query={{}} />
      </MemoryRouter>,
    ),
  );
  await click('Prepare QR sheets');
  await click('Prepare sheets');
  const printButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Print QR sheets',
  );
  expect(printButton?.disabled).toBe(true);
  expect(container.textContent).toContain('Printing is unavailable until every eligible bus');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/buses/bus-b');

  mocks.qr.mockResolvedValueOnce({ status: 'ready', token: 'original-a' });
  mocks.qr.mockResolvedValueOnce({ status: 'ready', token: 'original-b' });
  await click('Prepare QR sheets');
  await click('Prepare sheets');
  expect(container.textContent).toContain('2 QR codes ready');
  expect(
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Print QR sheets',
    )?.disabled,
  ).toBe(false);
  expect(document.querySelectorAll('.qr-batch-print-root article')).toHaveLength(2);
  expect(mocks.image.mock.calls.map(([token]) => token)).toEqual([
    'original-a',
    'original-a',
    'original-b',
  ]);
});
