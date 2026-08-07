import { useRoutes } from 'react-router';
import { appRoutes } from '@/routes/router';

export default function App() {
  return useRoutes(appRoutes);
}
