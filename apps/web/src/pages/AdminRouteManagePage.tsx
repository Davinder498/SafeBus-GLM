import { Navigate, useParams } from 'react-router';
export function AdminRouteManagePage() {
  const { routeId } = useParams<{ routeId: string }>();
  return <Navigate to={`/admin/routes/${routeId}#route-details`} replace />;
}
