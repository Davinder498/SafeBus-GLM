import { afterEach, expect, it, vi } from 'vitest';
import { backDestination, installBackNavigation, type BackState } from './backNavigation';

const native = vi.hoisted(() => ({ callback: (() => undefined) as () => void,
  toggleBackButtonHandler: vi.fn(async () => undefined), minimizeApp: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: { ...native, addListener: vi.fn(async (_event, callback) => {
  native.callback = callback; return { remove: native.remove };
}) } }));
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

it('hands root Back to Android and returns deep links to the role home', () => {
  expect(backDestination({ pathname: '/driver', home: '/driver', historyIndex: 8 })).toBe('system');
  expect(backDestination({ pathname: '/login', home: '/parent', historyIndex: 1 })).toBe('system');
  expect(backDestination({ pathname: '/account/security', home: '/parent', historyIndex: 0 })).toBe('/parent');
  expect(backDestination({ pathname: '/account/security', home: '/parent', historyIndex: 2 })).toBe('history');
});

it('dismisses menus before navigating and disables interception on returning home', async () => {
  let state: BackState = { pathname: '/account', home: '/parent', historyIndex: 0 };
  const navigate = vi.fn();
  const controller = await installBackNavigation(() => state, navigate);
  const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); document.body.append(menu);
  const close = (event: KeyboardEvent) => { if (event.key === 'Escape') menu.remove(); };
  document.addEventListener('keydown', close);
  native.callback();
  expect(menu.isConnected).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  native.callback(); expect(navigate).toHaveBeenCalledWith('/parent');
  state = { ...state, pathname: '/parent' }; controller.refresh();
  await vi.waitFor(() => expect(native.toggleBackButtonHandler).toHaveBeenLastCalledWith({ enabled: false }));
  document.removeEventListener('keydown', close);
  await controller.dispose();
});

it('respects a busy dialog veto instead of leaving the trip screen', async () => {
  const dialog = document.createElement('dialog'); dialog.setAttribute('open', '');
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  const navigate = vi.fn();
  const controller = await installBackNavigation(() => ({ pathname: '/driver', home: '/driver', historyIndex: 0 }), navigate);
  native.callback();
  expect(dialog.hasAttribute('open')).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
  await controller.dispose();
});


it('does not repeatedly cross the native bridge for unchanged status updates', async () => {
  const controller = await installBackNavigation(
    () => ({ pathname: '/driver', home: '/driver', historyIndex: 0 }), vi.fn(),
  );
  await vi.waitFor(() => expect(native.toggleBackButtonHandler).toHaveBeenCalledTimes(1));
  controller.refresh(); controller.refresh(); controller.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(native.toggleBackButtonHandler).toHaveBeenCalledTimes(1);
  await controller.dispose();
});
