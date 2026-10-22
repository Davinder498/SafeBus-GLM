import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { BrandMark } from '@/components/ui/BrandMark';

interface PublicLayoutProps {
  children: ReactNode;
  overlayHeader?: boolean;
}

export function PublicLayout({ children, overlayHeader = false }: PublicLayoutProps) {
  return (
    <div
      className={`min-h-screen bg-[var(--color-canvas)]${overlayHeader ? '' : ' pt-24'}`}
      data-ui="public-shell"
    >
      {/* Match max-w-7xl body content after its responsive horizontal padding. */}
      <header
        className="fixed inset-x-4 top-3 z-30 mx-auto max-w-[76rem] rounded-2xl border border-white/70 bg-white/95 shadow-[0_8px_32px_rgb(7_19_28_/_0.15)] backdrop-blur-md sm:inset-x-6 sm:top-5 lg:inset-x-8"
        data-ui="public-app-bar"
      >
        <div className="flex h-14 items-center justify-between px-4 sm:px-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-md text-2xl font-extrabold tracking-tight"
            aria-label="SafeBus home"
          >
            <BrandMark />
          </Link>
          <NavLink
            to="/login"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-hover)]"
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
