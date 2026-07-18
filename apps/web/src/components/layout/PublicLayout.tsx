import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bus } from 'lucide-react';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700 text-white shadow-sm">
              <Bus className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">SafeBus Alberta</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="/#parents" className="transition-colors hover:text-slate-900">
              Parents
            </a>
            <a href="/#drivers" className="transition-colors hover:text-slate-900">
              Drivers
            </a>
            <a href="/#admins" className="transition-colors hover:text-slate-900">
              Admins
            </a>
          </nav>
          <NavLink
            to="/login"
            className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800"
          >
            Demo login
          </NavLink>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>SafeBus Alberta. Frontend MVP foundation.</p>
          <p>Works alongside existing student information systems.</p>
        </div>
      </footer>
    </div>
  );
}