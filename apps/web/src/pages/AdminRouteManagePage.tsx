import { useParams } from 'react-router';
import { AdminRoutesPage } from '@/pages/AdminRoutesPage';

export function AdminRouteManagePage() {
  const { routeId } = useParams<{ routeId: string }>();

  return <AdminRoutesPage initialRouteId={routeId} />;
}
