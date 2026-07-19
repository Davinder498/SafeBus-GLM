import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { session, profile, loading, authError, signOut } = useAuth();

  if (loading) {
    return (
      <PublicLayout>
        <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
          <Card className="w-full p-8 text-center">
            <p className="text-lg font-bold text-navy-900">Loading SafeBus</p>
            <p className="mt-2 text-gray-600">Checking your session...</p>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  if (session && profile?.status === 'invited') {
    return <Navigate to="/accept-invitation" replace />;
  }

  if (session && profile?.status === 'active') {
    return <Navigate to={getDashboardPath(profile.role)} replace />;
  }

  if (session && profile && ['suspended', 'disabled'].includes(profile.status)) {
    return (
      <PublicLayout>
        <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
          <Card className="w-full p-8 text-center">
            <h1 className="text-3xl font-bold text-navy-900">Account unavailable</h1>
            <p className="mt-3 text-gray-600">
              This SafeBus account is {profile.status}. Ask your administrator to reactivate it.
            </p>
            <Button
              type="button"
              className="mt-6"
              variant="secondary"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  if (session && !profile) {
    return (
      <PublicLayout>
        <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
          <Card className="w-full p-8 text-center">
            <h1 className="text-3xl font-bold text-navy-900">Profile setup needed</h1>
            <p className="mt-3 text-gray-600">
              {authError ??
                'Your account is signed in, but no SafeBus profile was found. Ask an administrator to finish your profile setup.'}
            </p>
            <Button
              type="button"
              className="mt-6"
              variant="secondary"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  return children;
}
