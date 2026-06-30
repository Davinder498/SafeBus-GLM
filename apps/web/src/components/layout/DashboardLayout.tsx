import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import clsx from 'clsx';

interface DashboardLayoutProps {
  title: string;
  portal: 'admin' | 'driver' | 'parent';
  navItems: string[];
  children: ReactNode;
}

export function DashboardLayout({ title, portal, navItems, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link to="/" className="text-sm font-semibold text-navy-600">
              SafeBus Alberta
            </Link>
            <p className="text-xl font-bold text-navy-900">{title}</p>
          </div>
          <Link
            to="/login"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
          >
            Switch demo
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2 shadow-sm lg:flex-col">
            {navItems.map((item, index) => {
              const to =
                index === 0
                  ? `/${portal}`
                  : `/${portal}#${item.toLowerCase().replaceAll(' ', '-')}`;
              return (
                <NavLink
                  key={item}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold',
                      isActive || index === 0
                        ? 'bg-navy-50 text-navy-800'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )
                  }
                >
                  {item}
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
