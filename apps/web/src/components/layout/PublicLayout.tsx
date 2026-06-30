import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold tracking-normal text-navy-900">
            SafeBus Alberta
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex">
            <a href="/#parents" className="hover:text-navy-800">
              Parents
            </a>
            <a href="/#drivers" className="hover:text-navy-800">
              Drivers
            </a>
            <a href="/#admins" className="hover:text-navy-800">
              Admins
            </a>
          </nav>
          <NavLink
            to="/login"
            className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Demo login
          </NavLink>
        </div>
      </header>
      {children}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-gray-600 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>SafeBus Alberta. Frontend MVP foundation.</p>
          <p>Works alongside existing student information systems.</p>
        </div>
      </footer>
    </div>
  );
}
