import { useEffect } from 'react';
import { Link } from 'react-router';
import { Monitor } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BrandMark } from '@/components/ui/BrandMark';
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

  useEffect(() => {
    void signOut();
  }, [signOut]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      data-ui="mobile-fallback"
    >
      <Card className="max-w-md p-8 text-center">
        <div className="mb-6 flex flex-col items-center gap-1">
          <BrandMark className="text-3xl" />
          <span className="text-xs text-slate-500">Mobile app</span>
        </div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50">
          <Monitor className="h-7 w-7 text-navy-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Admin access on web only</h1>
        <p className="mt-2 text-sm text-slate-600">
          The SafeBus mobile app is built for drivers and guardians. Admin features — fleet
          management, routes, people, and settings — are available on the SafeBus web app from a
          computer or tablet browser.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex rounded-lg bg-navy-700 px-5 py-3 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Return to sign in
        </Link>
      </Card>
    </div>
  );
}
