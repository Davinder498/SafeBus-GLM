import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentQrCredentialPanel } from './StudentQrCredentialPanel';
const mocks = vi.hoisted(() => ({ status: vi.fn(), manage: vi.fn(), image: vi.fn() }));
vi.mock('@/services/studentQrCredentialService', () => ({
  fetchStudentQrCredentialStatus: mocks.status,
  manageStudentQrCredential: mocks.manage,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.image } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
const token = `sbus_qr_v1_${'B'.repeat(43)}`;
async function render(disabled = false, studentId = 'student-1') {
  await act(async () =>
    root.render(
      <StudentQrCredentialPanel
        studentId={studentId}
        studentName="Avery Johnson"
        disabled={disabled}
      />,
    ),
  );
}
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button missing: ${label}`);
  await act(async () => button.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ hasActiveCredential: false });
  mocks.manage.mockResolvedValue({ status: 'active', rawToken: token });
  mocks.image.mockResolvedValue('data:image/png;base64,example');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
it('generates an actual encoded image with a print sheet and downloadable PNG', async () => {
  await render();
  await click('Generate');
  expect(mocks.manage).toHaveBeenCalledWith('student-1', 'generate');
  expect(mocks.image).toHaveBeenCalledWith(token, {
    width: 640,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  expect(container.querySelector('img')?.src).toBe('data:image/png;base64,example');
  expect(container.querySelector('a[download]')?.getAttribute('href')).toBe(
    'data:image/png;base64,example',
  );
  expect(container.querySelector('.student-qr-print-sheet')?.textContent).toContain('Avery J.');
  expect(document.body.textContent).not.toContain(token);
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  await click('Print');
  expect(print).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains('printing-student-qr')).toBe(true);
  window.dispatchEvent(new Event('afterprint'));
  expect(document.body.classList.contains('printing-student-qr')).toBe(false);
  await click('Done');
  expect(container.querySelector('img')).toBeNull();
});
it('confirms replacement, and removes the prior displayed image before acting', async () => {
  await render();
  await click('Generate');
  await click('Replace');
  expect(mocks.manage).toHaveBeenCalledTimes(1);
  await click('Replace pass');
  expect(mocks.manage).toHaveBeenLastCalledWith('student-1', 'rotate');
});
it('allows revocation for an inactive student but prevents generation and replacement', async () => {
  mocks.status.mockResolvedValue({ hasActiveCredential: true });
  mocks.manage.mockResolvedValue({ status: 'revoked', rawToken: null });
  await render(true);
  const buttons = [...container.querySelectorAll('button')];
  expect(buttons.find((item) => item.textContent === 'Generate')?.disabled).toBe(true);
  expect(buttons.find((item) => item.textContent === 'Replace')?.disabled).toBe(true);
  await click('Revoke');
  await click('Revoke pass');
  expect(mocks.manage).toHaveBeenCalledWith('student-1', 'revoke');
  expect(container.textContent).toContain('No active QR');
});
it('does not enable issuance when status cannot be loaded', async () => {
  mocks.status.mockRejectedValue(new Error('internal detail'));
  await render();
  expect(container.textContent).not.toContain('internal detail');
  expect(container.querySelector('button')?.disabled).toBe(true);
});
it('clears the previous pass on student changes', async () => {
  await render();
  await click('Generate');
  await render(false, 'student-2');
  expect(container.querySelector('img')).toBeNull();
  expect(mocks.status).toHaveBeenLastCalledWith('student-2');
});
