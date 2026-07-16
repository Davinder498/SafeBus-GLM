import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/useAuth';

interface DashboardLayoutProps {
  title: string;
  portal: 'admin' | 'driver' | 'parent';
  navItems: Array<DashboardNavItem | string>;
  children: ReactNode;
}

export interface DashboardNavItem {
  label: string;
  to?: string;
  group?: 'operations' | 'transportation' | 'people' | 'management';
  description?: string;
}

export const platformNavItems: DashboardNavItem[] = [
  { label: 'Tenants', to: '/admin/tenants', group: 'management' },
];

export const adminNavItems: DashboardNavItem[] = [
  { label: 'Overview', to: '/admin', group: 'operations', description: 'Operations hub' },
  { label: 'Trips', to: '/admin/trips', group: 'operations', description: 'Route readiness' },
  { label: 'Live', to: '/admin/live-trips', group: 'operations', description: 'Active trips' },
  {
    label: 'Routes',
    to: '/admin/routes',
    group: 'transportation',
    description: 'Routes and stops',
  },
  { label: 'Buses', to: '/admin/buses', group: 'transportation', description: 'Fleet records' },
  { label: 'Drivers', to: '/admin/drivers', group: 'transportation', description: 'Driver roster' },
  {
    label: 'Students',
    to: '/admin/students',
    group: 'transportation',
    description: 'Rider records',
  },
  {
    label: 'Assignments',
    to: '/admin/assignments',
    group: 'transportation',
    description: 'Student routes',
  },
  {
    label: 'Driver Assignments',
    to: '/admin/driver-assignments',
    group: 'transportation',
    description: 'Driver and bus links',
  },
  { label: 'Guardians', to: '/admin/guardians', group: 'people', description: 'Linked guardians' },
  { label: 'Schools', to: '/admin/schools', group: 'management', description: 'School records' },
  { label: 'Users', to: '/admin/users', group: 'management', description: 'Access records' },
  {
    label: 'Settings',
    to: '/admin/settings',
    group: 'management',
    description: 'Tenant configuration',
  },
];

const groupLabels: Record<NonNullable<DashboardNavItem['group']>, string> = {
  operations: 'Operations',
  transportation: 'Transportation',
  people: 'People',
  management: 'Management',
};

function normalizeNavItem(
  item: DashboardNavItem | string,
  index: number,
  portal: DashboardLayoutProps['portal'],
): DashboardNavItem {
  if (typeof item !== 'string') return item;
  return {
    label: item,
    to: index === 0 ? `/${portal}` : `/${portal}#${item.toLowerCase().replaceAll(' ', '-')}`,
  };
}

function WorkspaceMark() {
  return (
    <Link
      to="/"
      className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-sm font-black text-cyan-800">
        SB
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-navy-950">SafeBus Alberta</span>
        <span className="block truncate text-xs font-medium text-gray-500">Tenant workspace</span>
      </span>
    </Link>
  );
}

function TenantNavigation({
  navItems,
  portal,
  onNavigate,
}: {
  navItems: Array<DashboardNavItem | string>;
  portal: DashboardLayoutProps['portal'];
  onNavigate?: () => void;
}) {
  const grouped = useMemo(() => {
    const normalized = navItems.map((item, index) => normalizeNavItem(item, index, portal));
    return normalized.reduce<Record<string, DashboardNavItem[]>>((acc, item) => {
      const group = item.group ?? 'operations';
      acc[group] = [...(acc[group] ?? []), item];
      return acc;
    }, {});
  }, [navItems, portal]);

  return (
    <nav aria-label="Tenant admin navigation" className="space-y-6">
      {(Object.keys(groupLabels) as Array<keyof typeof groupLabels>).map((group) => {
        const items = grouped[group] ?? [];
        if (items.length === 0) return null;
        return (
          <div
            key={group}
            className={clsx(group === 'management' && 'border-t border-gray-200 pt-5')}
          >
            <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gray-400">
              {groupLabels[group]}
            </p>
            <div className="mt-2 space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to ?? `/${portal}`}
                  end={(item.to ?? `/${portal}`) === `/${portal}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
                      isActive
                        ? 'border-cyan-200 bg-cyan-50 text-navy-950'
                        : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-navy-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.description && (
                          <span className="block truncate text-xs font-medium text-gray-500">
                            {item.description}
                          </span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'h-2 w-2 shrink-0 rounded-full',
                          isActive ? 'bg-cyan-600' : 'bg-transparent group-hover:bg-gray-300',
                        )}
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function TenantAdminShell({ title, portal, navItems, children }: DashboardLayoutProps) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-navy-950">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-gray-200 bg-slate-100/80 px-4 py-5 lg:block">
          <div className="sticky top-5 flex h-[calc(100vh-2.5rem)] flex-col gap-6">
            <WorkspaceMark />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <TenantNavigation navItems={navItems} portal={portal} />
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Tenant admin navigation"
          >
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-navy-950/45"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative flex h-full w-[min(22rem,calc(100vw-2rem))] flex-col gap-6 overflow-y-auto border-r border-gray-200 bg-slate-50 p-4 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <WorkspaceMark />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setMobileOpen(false)}
                >
                  Close
                </Button>
              </div>
              <TenantNavigation
                navItems={navItems}
                portal={portal}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open tenant admin navigation"
                  className="lg:hidden"
                >
                  Menu
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-500">{title}</p>
                  <p className="truncate text-base font-bold text-navy-950">
                    {profile?.full_name ?? 'Tenant admin workspace'}
                  </p>
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </header>
          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[92rem]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ title, portal, navItems, children }: DashboardLayoutProps) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  if (portal === 'admin') {
    return (
      <TenantAdminShell title={title} portal={portal} navItems={navItems}>
        {children}
      </TenantAdminShell>
    );
  }

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link to="/" className="text-sm font-semibold text-navy-600">
              SafeBus Alberta
            </Link>
            <p className="text-xl font-bold text-navy-900">{title}</p>
            {profile?.full_name && <p className="text-sm text-gray-600">{profile.full_name}</p>}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2 shadow-sm lg:flex-col">
            {navItems.map((item, index) => {
              const normalized = normalizeNavItem(item, index, portal);
              const to = normalized.to ?? `/${portal}`;
              return (
                <NavLink
                  key={normalized.label}
                  to={to}
                  end={to === `/${portal}`}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold',
                      isActive
                        ? 'bg-navy-50 text-navy-800'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )
                  }
                >
                  {normalized.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
