import { useLocation, useRoutes } from 'react-router';
import { appRoutes } from '@/routes/router';
import { PageBoundary } from '@/routes/PageBoundary';

export default function App() {
  const { pathname } = useLocation();
  const page = useRoutes(appRoutes);
  return <PageBoundary key={pathname}>{page}</PageBoundary>;
}
