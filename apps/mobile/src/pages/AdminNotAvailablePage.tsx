import { Bus, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/useAuth';

/**
 * Mobile-only page shown when an admin signs in to the driver/guardian app.
 *
 * Admin features (fleet management, routes, people, settings) require the full
 * desktop web experience. This page guides the admin to sign out and use the
 * web app, while keeping the mobile app focused on drivers and guardians.
 */
export function AdminNotAvailablePage() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50">
          <Monitor className="h-7 w-7 text-navy-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Admin access on web only</h1>
        <p className="mt-2 text-sm text-slate-600">
          The SafeBus mobile app is built for drivers and guardians. Admin features — fleet
          management, routes, people, and settings — are available on the SafeBus web app from a
          computer or tablet browser.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={import.meta.env.VITE_APP_ORIGIN ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <Bus className="h-4 w-4" />
            Open SafeBus web app
          </a>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}