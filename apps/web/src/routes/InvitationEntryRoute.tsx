import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/useAuth';

interface InvitationEntryRouteProps {
  children: ReactNode;
}

export function InvitationEntryRoute({ children }: InvitationEntryRouteProps) {
  const { session, profile } = useAuth();

  // Supabase falls back to the configured Site URL when an invitation
  // redirect is missing or rejected. Once the invite session is established,
  // recover that root callback and send the invited account to password setup.
  if (session && profile?.status === 'invited') {
    return <Navigate to="/accept-invitation" replace />;
  }

  return children;
}
