import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { getDashboardPath, type ProfileRole } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

interface ProtectedRouteProps {
  allowedRoles: ProfileRole[];
  children: ReactNode;
}

function LoadingScreen() {
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

function AuthMessage({ title, message }: { title: string; message: string }) {
  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-8 text-center">
          <h1 className="text-3xl font-bold text-navy-900">{title}</h1>
          <p className="mt-3 text-gray-600">{message}</p>
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
          >
            Go to login
          </Link>
        </Card>
      </main>
    </PublicLayout>
  );
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { session, profile, loading, authError } = useAuth();

  if (loading) return <LoadingScreen />;

  if (authError && !session) {
    return <AuthMessage title="Authentication unavailable" message={authError} />;
  }

  if (!session) {
    return (
      <AuthMessage
        title="Sign in required"
        message="Use your SafeBus account to access this dashboard."
      />
    );
  }

  if (authError || !profile) {
    return (
      <AuthMessage
        title="Profile setup needed"
        message={authError ?? 'Your SafeBus profile could not be loaded.'}
      />
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <PublicLayout>
        <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
          <Card className="w-full p-8 text-center">
            <h1 className="text-3xl font-bold text-navy-900">Wrong portal</h1>
            <p className="mt-3 text-gray-600">
              Your account is active, but this dashboard is not available for your role.
            </p>
            <Link
              to={getDashboardPath(profile.role)}
              className="mt-6 inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
            >
              Open your dashboard
            </Link>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  return children;
}
