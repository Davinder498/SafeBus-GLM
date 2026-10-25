import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/useAuth';

/** Preserve old account links while keeping personal settings in one place. */
export function AccountSettingsPage() {
  const { profile } = useAuth();
  return (
    <Navigate
      to={profile?.role === 'driver' ? '/driver/settings' : '/notifications/settings'}
      replace
    />
  );
}
