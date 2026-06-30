import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card } from '@/components/ui/Card';

export function NotFoundPage() {
  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-700">404</p>
          <h1 className="mt-2 text-3xl font-bold text-navy-900">Page not found</h1>
          <p className="mt-3 text-gray-600">
            This route is not part of the SafeBus Alberta frontend foundation.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
          >
            Return home
          </Link>
        </Card>
      </main>
    </PublicLayout>
  );
}
