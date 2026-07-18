agent/student-onboarding-workflow
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  IdCard,
  Bus,
  Route,
  Radio,
  School,
  Settings,
  ClipboardList,
  Building2,
  Calendar,
  LogOut,
  Bell,
  Menu,
  X,
  MapPinned,
  List,
} from 'lucide-react';
import { cn } from '@/utils/cn';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
main
import { useAuth } from '@/contexts/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/DropdownMenu';
import { getRoleLabel } from '@/components/ui/RoleBadge';

export interface DashboardNavItem {
  label: string;
  to?: string;
  /** Optional Lucide icon node rendered before the label. */
  icon?: ReactNode;
}

export interface DashboardNavGroup {
  label?: string;
  items: DashboardNavItem[];
}

interface DashboardLayoutProps {
  title: string;
  portal: 'admin' | 'driver' | 'parent';
  /**
   * Flat list of nav items (backward compatible). If `navGroups` is also
   * supplied, the grouped view takes precedence.
   */
  navItems: Array<DashboardNavItem | string>;
  /** Optional grouped nav for the modern sidebar. */
  navGroups?: DashboardNavGroup[];
  children: ReactNode;
}

agent/student-onboarding-workflow
/* ----------------------------- nav definitions ---------------------------- */

export const platformNavItems: DashboardNavItem[] = [
  { label: 'Tenants', to: '/admin/tenants', icon: <Building2 className="h-4 w-4" /> },

export interface DashboardNavItem {
  label: string;
  to?: string;
  group?: 'operations' | 'transportation' | 'people' | 'management';
  description?: string;
}

export const platformNavItems: DashboardNavItem[] = [
  { label: 'Tenants', to: '/admin/tenants', group: 'management' },
main
];

export const platformNavGroups: DashboardNavGroup[] = [
  {
    label: 'Platform',
    items: platformNavItems,
  },
];

// Kept identical (same labels + `to` paths) for backward compatibility — only
// icons are added. Pages that pass `adminNavItems` continue to work unchanged.
export const adminNavItems: DashboardNavItem[] = [
agent/student-onboarding-workflow
  { label: 'Overview', to: '/admin', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Students', to: '/admin/students', icon: <IdCard className="h-4 w-4" /> },
  { label: 'Guardians', to: '/admin/guardians', icon: <UserCircle className="h-4 w-4" /> },
  { label: 'Drivers', to: '/admin/drivers', icon: <Users className="h-4 w-4" /> },
  { label: 'Buses', to: '/admin/buses', icon: <Bus className="h-4 w-4" /> },
  { label: 'Routes', to: '/admin/routes', icon: <Route className="h-4 w-4" /> },
  { label: 'Live', to: '/admin/live-trips', icon: <Radio className="h-4 w-4" /> },
];

// Modern grouped nav covering all existing admin routes. `to` paths match the
// router exactly — no new routes are introduced.
export const adminNavGroups: DashboardNavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Overview', to: '/admin', icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: 'Live trips', to: '/admin/live-trips', icon: <Radio className="h-4 w-4" /> },
      { label: 'Trips', to: '/admin/trips', icon: <Calendar className="h-4 w-4" /> },
      { label: 'Routes', to: '/admin/routes', icon: <Route className="h-4 w-4" /> },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', to: '/admin/students', icon: <IdCard className="h-4 w-4" /> },
      { label: 'Guardians', to: '/admin/guardians', icon: <UserCircle className="h-4 w-4" /> },
      { label: 'Drivers', to: '/admin/drivers', icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Buses', to: '/admin/buses', icon: <Bus className="h-4 w-4" /> },
      { label: 'Assignments', to: '/admin/assignments', icon: <ClipboardList className="h-4 w-4" /> },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Schools', to: '/admin/schools', icon: <School className="h-4 w-4" /> },
      { label: 'Users', to: '/admin/users', icon: <Users className="h-4 w-4" /> },
      { label: 'Settings', to: '/admin/settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

// Modern grouped nav for the driver portal. Routes match the router.
export const driverNavGroups: DashboardNavGroup[] = [
  {
    label: 'Driver',
    items: [
      { label: 'Today', to: '/driver', icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: 'Manifest', to: '/driver/manifest', icon: <List className="h-4 w-4" /> },
    ],
  },
];

// Modern grouped nav for the guardian portal. Routes match the router.
export const guardianNavGroups: DashboardNavGroup[] = [
  {
    label: 'Guardian',
    items: [
      { label: 'Home', to: '/parent', icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: 'Live map', to: '/guardian/live-map', icon: <MapPinned className="h-4 w-4" /> },
      { label: 'Live trips', to: '/guardian/live', icon: <Radio className="h-4 w-4" /> },
      { label: 'Routes', to: '/guardian/routes', icon: <Route className="h-4 w-4" /> },
      { label: 'Events', to: '/guardian/events', icon: <Calendar className="h-4 w-4" /> },
    ],
  },
];



const portalTitles: Record<DashboardLayoutProps['portal'], string> = {
  admin: 'Admin',
  driver: 'Driver',
  parent: 'Guardian',
};

function normalizeItem(item: DashboardNavItem | string, index: number, portal: string): DashboardNavItem {
  if (typeof item === 'string') {
    return {
      label: item,
      to: index === 0 ? `/${portal}` : `/${portal}#${item.toLowerCase().replaceAll(' ', '-')}`,
    };
  }
  return { ...item, to: item.to ?? `/${portal}` };
}

function NavListItem({
  item,
  portal,
  onNavigate,
}: {
  item: DashboardNavItem;
  portal: string;
  onNavigate?: () => void;
}) {
  const to = item.to ?? `/${portal}`;
  return (
    <NavLink
      to={to}
      end={to === `/${portal}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-navy-50 text-navy-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      {item.icon && <span className="shrink-0 text-slate-400">{item.icon}</span>}
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}


export function DashboardLayout({ title, portal, navItems, navGroups, children }: DashboardLayoutProps) {

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
main
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const normalizedFlat = navItems.map((item, i) => normalizeItem(item, i, portal));
  const groups: DashboardNavGroup[] =
    navGroups ?? (normalizedFlat.length > 0 ? [{ items: normalizedFlat }] : []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700 text-white shadow-sm">
              <Bus className="h-5 w-5" aria-hidden />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-bold text-slate-900">SafeBus Alberta</span>
              <span className="text-xs text-slate-500">{portalTitles[portal]} portal</span>
            </span>
          </Link>

          {/* Page title (breadcrumb-style) */}
          <div className="ml-2 hidden min-w-0 flex-1 md:block">
            <p className="truncate text-sm font-medium text-slate-500">
              {portalTitles[portal]} <span className="mx-1 text-slate-300">/</span>{' '}
              <span className="font-semibold text-slate-900">{title.replace(`${portalTitles[portal]} `, '')}</span>
            </p>
          </div>

          {/* Spacer for mobile when title hidden */}
          <div className="flex-1 md:hidden" />

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>

            <DropdownMenu
              trigger={
                <span className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors hover:bg-slate-100">
                  <Avatar name={profile?.full_name ?? undefined} size="sm" />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-semibold text-slate-900">
                      {profile?.full_name ?? 'Account'}
                    </span>
                    <span className="block text-xs capitalize text-slate-500">
                      {profile ? getRoleLabel(profile.role) : ''}
                    </span>
                  </span>
                </span>
              }
            >
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">{profile?.full_name ?? 'Account'}</p>
                <p className="truncate text-xs text-slate-500">{profile?.email}</p>
              </div>
              <DropdownSeparator />
              <DropdownItem icon={<LogOut className="h-4 w-4" />} onClick={handleLogout}>
                Sign out
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>
      </header>
agent/student-onboarding-workflow

      {/* Body: sidebar + main */}
      <div className="mx-auto flex max-w-[1400px] gap-0 px-0 lg:px-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-6 lg:block">
          <SidebarNav groups={groups} portal={portal} />

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
main
        </aside>

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-popover animate-slide-in-right">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Bus className="h-4 w-4 text-navy-600" /> SafeBus Alberta
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarNav groups={groups} portal={portal} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  groups,
  portal,
  onNavigate,
}: {
  groups: DashboardNavGroup[];
  portal: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-6 px-3" aria-label="Primary">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavListItem key={item.label} item={item} portal={portal} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}