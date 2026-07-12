import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
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
}

export const adminNavItems: DashboardNavItem[] = [
  { label: 'Overview', to: '/admin' },
  { label: 'Setup', to: '/admin/setup' },
  { label: 'Operations', to: '/admin/operations' },
  { label: 'People', to: '/admin/people' },
  { label: 'More', to: '/admin/more' },
];

export function DashboardLayout({ title, portal, navItems, children }: DashboardLayoutProps) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

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
              const label = typeof item === 'string' ? item : item.label;
              const to =
                typeof item === 'string'
                  ? index === 0
                    ? `/${portal}`
                    : `/${portal}#${item.toLowerCase().replaceAll(' ', '-')}`
                  : (item.to ?? `/${portal}`);
              return (
                <NavLink
                  key={label}
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
                  {label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
