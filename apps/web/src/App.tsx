import { useRoutes } from 'react-router-dom';
import { appRoutes } from '@/routes/router';

export default function App() {
  return useRoutes(appRoutes);
}
