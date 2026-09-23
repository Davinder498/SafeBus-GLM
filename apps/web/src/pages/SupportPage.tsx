import { useAuth } from '@/contexts/useAuth';
import { AdminSupportPage } from '@/pages/AdminSupportPage';
import { MobileSupportPage } from '@/pages/MobileSupportPage';

/**
 * Keeps the shared /support destination role-aware:
 * tenant administrators contact the platform administrator and maintain their
 * published contact, while drivers and guardians see only that tenant contact.
 */
export function SupportPage() {
  const { profile } = useAuth();

  return profile?.role === 'tenant_admin' ? <AdminSupportPage /> : <MobileSupportPage />;
}
