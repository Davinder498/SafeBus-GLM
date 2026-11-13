import { useLocation, useRoutes } from 'react-router';
import { appRoutes } from './routes/router';
import { PageBoundary } from '@/routes/PageBoundary';
import { NativeNavigation } from './native/NativeNavigation';

/**
 * Mobile app root.
 *
 * Identical structure to apps/web/src/App.tsx — renders the route table via
 * useRoutes(). The only difference is `appRoutes` is the mobile subset
 * (driver + guardian + auth).
 */
export default function App() {
  const { pathname } = useLocation();
  const page = useRoutes(appRoutes);
  return <><NativeNavigation /><PageBoundary key={pathname}>{page}</PageBoundary></>;
}
