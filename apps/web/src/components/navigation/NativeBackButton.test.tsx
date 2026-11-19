import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppSurfaceProvider } from '@/contexts/AppSurfaceContext';
import { NativeBackButton, nativeParent, isNativeRoot } from './NativeBackButton';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
function Probe() {
  const location = useLocation();
  return <span data-path>{location.pathname}</span>;
}
describe('native return navigation', () => {
  it('uses the security parent for direct password and MFA entry', () => {
    expect(nativeParent('/account/security/password', false)).toBe('/account/security');
    expect(nativeParent('/account/security/mfa', true)).toBe('/account/security');
    expect(nativeParent('/account-deletion', false)).toBe('/privacy');
    expect(nativeParent('/guardian/buses/24', false)).toBe('/guardian/routes');
  });
  it('keeps root tabs distinct from alert details and driver alerts', () => {
    expect(isNativeRoot('/notifications', false)).toBe(true);
    expect(isNativeRoot('/notifications', false, '?notification=example')).toBe(false);
    expect(isNativeRoot('/notifications', true)).toBe(false);
    expect(isNativeRoot('/driver/pickup-drop-off', true)).toBe(true);
    expect(isNativeRoot('/account/security', false)).toBe(false);
  });
  it('returns directly entered settings to Account without exiting the app', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    window.history.replaceState({ idx: 0 }, '');
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/notifications/settings']}>
          <AppSurfaceProvider surface="native-mobile">
            <NativeBackButton fallback="/account" />
            <Probe />
          </AppSurfaceProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('[data-path]')!.textContent).toBe('/account');
    await act(async () => root.unmount());
    host.remove();
  });
});
