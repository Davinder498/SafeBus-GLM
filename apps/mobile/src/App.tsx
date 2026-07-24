import { useRoutes } from 'react-router-dom';
import { appRoutes } from './routes/router';

/**
 * Mobile app root.
 *
 * Identical structure to apps/web/src/App.tsx — renders the route table via
 * useRoutes(). The only difference is `appRoutes` is the mobile subset
 * (driver + guardian + auth).
 */
export default function App() {
  return useRoutes(appRoutes);
}