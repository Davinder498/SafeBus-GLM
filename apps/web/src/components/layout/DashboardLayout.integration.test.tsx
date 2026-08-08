import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSurfaceProvider, type AppSurface } from '@/contexts/AppSurfaceContext';
import {
  AuthContext,
  type AuthContextValue,
  type Profile,
} from '@/contexts/AuthContext';
import { DashboardLayout, driverNavGroups } from './DashboardLayout';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const driverProfile: Profile = {
  id: 'driver-profile-id',
  tenant_id: 'tenant-id',
  school_id: 'school-id',
  full_name: 'Test Driver',
  email: 'driver@example.test',
  role: 'driver',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const authValue: AuthContextValue = {
  session: null,
  user: null,
  profile: driverProfile,
  loading: false,
  authError: null,
  configError: null,
  mfaStatus: { currentLevel: null, nextLevel: null, verifiedFactors: [] },
  mfaLoading: false,
  refreshMfa: vi.fn(async () => ({
    currentLevel: null,
    nextLevel: null,
    verifiedFactors: [],
  })),
  signIn: vi.fn(async () => driverProfile),
  signOut: vi.fn(async () => undefined),
  requestPasswordReset: vi.fn(async () => undefined),
  completeInvitation: vi.fn(async () => driverProfile),
  updatePassword: vi.fn(async () => undefined),
  refreshProfile: vi.fn(async () => driverProfile),
};

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}</span>;
}

async function renderDriverLayout(surface?: AppSurface) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  const layout = (
    <AuthContext.Provider value={authValue}>
      <DashboardLayout
        title="Driver Dashboard"
        portal="driver"
        navItems={[]}
        navGroups={driverNavGroups}
      >
        <LocationProbe />
      </DashboardLayout>
    </AuthContext.Provider>
  );

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={['/driver/history']}>
        {surface ? <AppSurfaceProvider surface={surface}>{layout}</AppSurfaceProvider> : layout}
      </MemoryRouter>,
    );
  });

  return container;
}

describe('DashboardLayout navigation presentation', () => {
  it('renders the existing drawer and sidebar shell by default', async () => {
    const container = await renderDriverLayout();

    expect(container.querySelector('[data-testid="native-bottom-navigation"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Open navigation"]')).not.toBeNull();
    expect(container.querySelector('aside')).not.toBeNull();
  });

  it('renders four active-aware tabs without a drawer on the native surface', async () => {
    const container = await renderDriverLayout('native-mobile');
    const navigation = container.querySelector('[data-testid="native-bottom-navigation"]');
    const tabs = Array.from(navigation?.querySelectorAll('a') ?? []);

    expect(navigation).not.toBeNull();
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Scan', 'Riders', 'History', 'Settings']);
    expect(tabs.find((tab) => tab.getAttribute('aria-current') === 'page')?.textContent).toBe(
      'History',
    );
    expect(container.querySelector('button[aria-label="Open navigation"]')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('opens the secondary driver Profile route from the account menu', async () => {
    const container = await renderDriverLayout('native-mobile');
    const accountButton = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');

    await act(async () => accountButton?.click());

    const profileButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.trim() === 'Profile');
    await act(async () => profileButton?.click());

    expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe(
      '/driver/profile',
    );
  });
});
