import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { BrandMark } from '@/components/ui/BrandMark';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)]" data-ui="public-shell">
      <header
        className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/95 shadow-[0_1px_0_rgb(23_43_58_/_0.06)] backdrop-blur-md"
        data-ui="public-app-bar"
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="SafeBus home">
            <BrandMark className="!h-9 !w-9 sm:!h-10 sm:!w-10" iconClassName="!h-full !w-full" />
            <span className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              SafeBus
            </span>
          </Link>
          <NavLink
            to="/login"
            className="shrink-0 px-2 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950"
          >
            Sign in
          </NavLink>
        </div>
      </header>
      {children}
      <footer
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)]"
        data-ui="public-footer"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <p>© {new Date().getUTCFullYear()} SafeBus</p>
          <nav aria-label="Footer" className="flex shrink-0 items-center gap-4">
            <Link
              className="inline-flex min-h-11 items-center text-slate-600 hover:text-slate-950"
              to="/contact"
            >
              Contact
            </Link>
            <Link
              className="inline-flex min-h-11 items-center text-slate-600 hover:text-slate-950"
              to="/privacy"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
