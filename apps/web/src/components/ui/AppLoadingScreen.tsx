import { BrandMark } from './BrandMark';
import { Card } from './Card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';

export function AppLoadingScreen() {
  const appSurface = useAppSurface();

  if (appSurface === 'native-mobile') {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-6 text-center"
        data-ui="app-loading"
        role="status"
      >
        <div className="flex flex-col items-center" data-ui="app-loading-content">
          <BrandMark className="text-4xl" />
          <p className="mt-4 text-sm font-medium text-navy-700">Loading your bus information</p>
          <span className="mt-5 h-1.5 w-16 overflow-hidden rounded-full" aria-hidden>
            <span className="block h-full w-1/2 rounded-full" />
          </span>
        </div>
      </main>
    );
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-8 text-center">
          <BrandMark className="text-3xl" />
          <p className="mt-4 text-lg font-bold text-navy-900">Loading</p>
          <p className="mt-2 text-gray-600">Checking your session...</p>
        </Card>
      </main>
    </PublicLayout>
  );
}
