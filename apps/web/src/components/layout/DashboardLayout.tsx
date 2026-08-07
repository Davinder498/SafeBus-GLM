import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, type NavLinkRenderProps } from 'react-router';
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
  History,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppSurface, type AppSurface } from '@/contexts/AppSurfaceContext';
import { useAuth } from '@/contexts/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/DropdownMenu';
import { getRoleLabel } from '@/components/ui/RoleBadge';

export interface DashboardNavItem {
  label: string;
  to?: string;
  group?: 'operations' | 'transportation' | 'people' | 'management';
  description?: string;
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

/* ----------------------------- nav definitions ---------------------------- */

export const platformNavItems: DashboardNavItem[] = [
  { label: 'Tenants', to: '/admin/tenants', icon: <Building2 className="h-4 w-4" /> },
];

export const platformNavGroups: DashboardNavGroup[] = [
  {
    label: 'Platform',
    items: platformNavItems,
  },
];

export const adminNavItems: DashboardNavItem[] = [
  {
    label: 'Overview',
    to: '/admin',
    group: 'operations',
    description: 'Operations hub',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: 'Live Operations',
    to: '/admin/live-trips',
    group: 'operations',
    description: 'Live fleet and trip history',
    icon: <Radio className="h-4 w-4" />,
  },
  {
    label: 'Routes',
    to: '/admin/routes',
    group: 'transportation',
    description: 'Routes and stops',
    icon: <Route className="h-4 w-4" />,
  },
  {
    label: 'Buses',
    to: '/admin/buses',
    group: 'transportation',
    description: 'Fleet records',
    icon: <Bus className="h-4 w-4" />,
  },
  {
    label: 'Drivers',
    to: '/admin/drivers',
    group: 'people',
    description: 'Driver roster',
    icon: <Users className="h-4 w-4" />,
  },
  {
    label: 'Students',
    to: '/admin/students',
    group: 'people',
    description: 'Rider records',
    icon: <IdCard className="h-4 w-4" />,
  },
  {
    label: 'Student Bus Assignment',
    to: '/admin/assignments',
    group: 'transportation',
    description: 'Student routes',
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    label: 'Guardians',
    to: '/admin/guardians',
    group: 'people',
    description: 'Linked guardians',
    icon: <UserCircle className="h-4 w-4" />,
  },
  {
    label: 'Schools',
    to: '/admin/schools',
    group: 'management',
    description: 'School records',
    icon: <School className="h-4 w-4" />,
  },
  {
    label: 'Users',
    to: '/admin/users',
    group: 'management',
    description: 'Access records',
    icon: <Users className="h-4 w-4" />,
  },
  {
    label: 'Settings',
    to: '/admin/settings',
    group: 'management',
    description: 'Tenant configuration',
    icon: <Settings className="h-4 w-4" />,
  },
];

export const adminNavGroups: DashboardNavGroup[] = [
  {
    label: 'Operations',
    items: adminNavItems.filter((item) => item.group === 'operations'),
  },
  {
    label: 'Transportation',
    items: adminNavItems.filter((item) => item.group === 'transportation'),
  },
  {
    label: 'People',
    items: adminNavItems.filter((item) => item.group === 'people'),
  },
  {
    label: 'Management',
    items: adminNavItems.filter((item) => item.group === 'management'),
  },
];

// Modern grouped nav for the driver portal. Routes match the router.
export const driverNavGroups: DashboardNavGroup[] = [
  {
    label: 'Driver',
    items: [
      { label: 'Scan bus', to: '/driver', icon: <Bus className="h-4 w-4" /> },
      { label: 'Trip history', to: '/driver/history', icon: <History className="h-4 w-4" /> },
      {
        label: 'Pickup & drop-off',
        to: '/driver/pickup-drop-off',
        icon: <List className="h-4 w-4" />,
      },
      { label: 'Settings', to: '/driver/settings', icon: <Settings className="h-4 w-4" /> },
      { label: 'Profile', to: '/driver/profile', icon: <UserCircle className="h-4 w-4" /> },
    ],
  },
];

// Bus-first guardian navigation. The legacy /guardian/routes path is retained
// as a stable URL, but the page intentionally exposes assigned buses only.
export const guardianNavGroups: DashboardNavGroup[] = [
  {
    label: 'Guardian',
    items: [
      { label: 'Home', to: '/parent', icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: 'Live map', to: '/guardian/live-map', icon: <MapPinned className="h-4 w-4" /> },
      { label: 'Bus status', to: '/guardian/live', icon: <Radio className="h-4 w-4" /> },
      { label: 'My buses', to: '/guardian/routes', icon: <Bus className="h-4 w-4" /> },
      {
        label: 'Pickup & drop-off',
        to: '/guardian/events',
        icon: <Calendar className="h-4 w-4" />,
      },
    ],
  },
];

export const driverNativeNavItems: DashboardNavItem[] = [
  { label: 'Scan', to: '/driver', icon: <Bus className="h-5 w-5" /> },
  {
    label: 'Riders',
    to: '/driver/pickup-drop-off',
    icon: <List className="h-5 w-5" />,
  },
  { label: 'History', to: '/driver/history', icon: <History className="h-5 w-5" /> },
  { label: 'Settings', to: '/driver/settings', icon: <Settings className="h-5 w-5" /> },
];

export const guardianNativeNavItems: DashboardNavItem[] = [
  { label: 'Home', to: '/parent', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Map', to: '/guardian/live-map', icon: <MapPinned className="h-5 w-5" /> },
  { label: 'Buses', to: '/guardian/routes', icon: <Bus className="h-5 w-5" /> },
  { label: 'Updates', to: '/guardian/events', icon: <Calendar className="h-5 w-5" /> },
];

/* -------------------------------- helpers --------------------------------- */

const portalTitles: Record<DashboardLayoutProps['portal'], string> = {
  admin: 'Admin',
  driver: 'Driver',
  parent: 'Guardian',
};

export type DashboardNavigationMode = 'sidebar' | 'bottom-tabs';

export function getDashboardNavigationMode(
  surface: AppSurface,
  portal: DashboardLayoutProps['portal'],
): DashboardNavigationMode {
  return surface === 'native-mobile' && portal !== 'admin' ? 'bottom-tabs' : 'sidebar';
}

function normalizeItem(
  item: DashboardNavItem | string,
  index: number,
  portal: string,
): DashboardNavItem {
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
      className={({ isActive }: NavLinkRenderProps) =>
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

/* ------------------------------- layout shell ------------------------------ */

export function DashboardLayout({
  title: _title,
  portal,
  navItems,
  navGroups,
  children,
}: DashboardLayoutProps) {
  const { signOut, profile } = useAuth();
  const appSurface = useAppSurface();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationMode = getDashboardNavigationMode(appSurface, portal);
  const usesBottomTabs = navigationMode === 'bottom-tabs';
  const bottomTabItems = portal === 'driver' ? driverNativeNavItems : guardianNativeNavItems;

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
        <div className="mx-auto flex h-16 max-w-[1400px] min-w-0 items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          {!usesBottomTabs && (
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {/* Brand */}
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700 text-white shadow-sm">
              <Bus className="h-5 w-5" aria-hidden />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-bold text-slate-900">SafeBus Alberta</span>
              <span className="text-xs text-slate-500">{portalTitles[portal]} portal</span>
            </span>
          </Link>

          <div className="flex-1" />

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="relative hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 min-[360px]:block"
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
                <p className="text-sm font-semibold text-slate-900">
                  {profile?.full_name ?? 'Account'}
                </p>
                <p className="truncate text-xs text-slate-500">{profile?.email}</p>
              </div>
              <DropdownSeparator />
              {usesBottomTabs && portal === 'driver' && (
                <>
                  <DropdownItem
                    icon={<UserCircle className="h-4 w-4" />}
                    onClick={() => navigate('/driver/profile')}
                  >
                    Profile
                  </DropdownItem>
                  <DropdownSeparator />
                </>
              )}
              <DropdownItem icon={<LogOut className="h-4 w-4" />} onClick={handleLogout}>
                Sign out
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="mx-auto flex max-w-[1400px] gap-0 px-0 lg:px-6">
        {/* Desktop sidebar */}
        {!usesBottomTabs && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-6 lg:block">
            <SidebarNav groups={groups} portal={portal} />
          </aside>
        )}

        {/* Mobile sidebar drawer */}
        {!usesBottomTabs && mobileOpen && (
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
        <main
          className="min-w-0 max-w-full flex-1 px-3 py-5 sm:px-6 sm:py-6 lg:px-8"
          style={
            usesBottomTabs
              ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }
              : undefined
          }
        >
          <div className="animate-fade-in-up">{children}</div>
        </main>
      </div>

      {usesBottomTabs && <BottomTabNav items={bottomTabItems} portal={portal} />}
    </div>
  );
}

function BottomTabNav({
  items,
  portal,
}: {
  items: DashboardNavItem[];
  portal: DashboardLayoutProps['portal'];
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur-md"
      aria-label="Primary navigation"
      data-testid="native-bottom-navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid min-h-16 max-w-2xl grid-cols-4 px-1">
        {items.map((item) => {
          const to = item.to ?? `/${portal}`;
          return (
            <NavLink
              key={item.label}
              to={to}
              end={to === `/${portal}`}
              className={({ isActive }: NavLinkRenderProps) =>
                cn(
                  'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500',
                  isActive
                    ? 'bg-navy-50 font-bold text-navy-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )
              }
            >
              {item.icon && <span aria-hidden>{item.icon}</span>}
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
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
