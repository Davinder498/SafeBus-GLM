import type { RouteObject } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
import { ParentDashboardPage } from '@/pages/ParentDashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const appRoutes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/admin', element: <AdminDashboardPage /> },
  { path: '/driver', element: <DriverDashboardPage /> },
  { path: '/parent', element: <ParentDashboardPage /> },
  { path: '*', element: <NotFoundPage /> },
];
