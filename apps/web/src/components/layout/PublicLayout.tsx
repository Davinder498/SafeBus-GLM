import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { BrandMark } from '@/components/ui/BrandMark';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-white" data-ui="public-shell">
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md"
        data-ui="public-app-bar"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <span className="hidden text-base font-bold tracking-tight text-slate-900 min-[390px]:inline">
              BusSafe Alberta
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <NavLink
              to="/login"
              className="px-2 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950"
            >
              Sign in
            </NavLink>
            <NavLink
              to="/contact"
              className="rounded-lg bg-navy-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:px-4"
            >
              Contact
            </NavLink>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-slate-50" data-ui="public-footer">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>BusSafe Alberta. Track the bus, not the child.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="font-medium text-slate-700 hover:text-slate-950" to="/contact">
              Contact
            </Link>
            <Link className="font-medium text-slate-700 hover:text-slate-950" to="/login">
              Administrator sign in
            </Link>
            <Link className="font-medium text-slate-700 hover:text-slate-950" to="/privacy">
              Privacy
            </Link>
            <Link
              className="font-medium text-slate-700 hover:text-slate-950"
              to="/account-deletion"
            >
              Account deletion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
