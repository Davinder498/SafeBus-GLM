import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { BrandMark } from '@/components/ui/BrandMark';

interface PublicLayoutProps {
  children: ReactNode;
  overlayHeader?: boolean;
  /** Landing-only anchor navigation; contact and legal pages retain their simple header. */
  landingNavigation?: boolean;
}

const landingLinks = [
  { href: '#platform', label: 'Platform' },
  { href: '#solutions', label: 'Solutions' },
  { href: '#why-choose-us', label: 'Why SafeBus' },
] as const;

export function PublicLayout({
  children,
  overlayHeader = false,
  landingNavigation = false,
}: PublicLayoutProps) {
  return (
    <div
      className={overlayHeader ? 'min-h-screen bg-[var(--color-canvas)]' : 'min-h-screen bg-[var(--color-canvas)] pt-24'}
      data-ui="public-shell"
    >
      {/* Match max-w-7xl body content after its responsive horizontal padding. */}
      <header
        className="fixed inset-x-4 top-3 z-30 mx-auto max-w-[76rem] rounded-2xl border border-white/70 bg-white/95 shadow-[0_8px_32px_rgb(7_19_28_/_0.15)] backdrop-blur-md sm:inset-x-6 sm:top-5 lg:inset-x-8"
        data-ui="public-app-bar"
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-5">
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-md text-2xl font-extrabold tracking-tight"
            aria-label="SafeBus home"
          >
            <BrandMark />
          </Link>

          {landingNavigation && (
            <nav aria-label="Website sections" className="hidden items-center gap-7 lg:flex">
              {landingLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-navy-700 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  {label}
                </a>
              ))}
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {landingNavigation && (
              <details className="group relative hidden sm:block lg:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-semibold text-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden">
                  Explore <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <nav
                  aria-label="Website sections"
                  className="absolute right-0 top-full mt-2 min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-popover"
                >
                  {landingLinks.map(({ href, label }) => (
                    <a
                      key={href}
                      href={href}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-navy-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                    >
                      {label}
                    </a>
                  ))}
                </nav>
              </details>
            )}
            <NavLink
              to="/login"
              className="sb-primary-action inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors sm:px-5"
            >
              Sign in
            </NavLink>
          </div>
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
