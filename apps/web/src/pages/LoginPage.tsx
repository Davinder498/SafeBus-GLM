import { useNavigate, Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const demoRoles = [
  {
    label: 'Admin Demo',
    path: '/admin',
    description: 'Operations dashboard and live trip overview',
  },
  {
    label: 'Driver Demo',
    path: '/driver',
    description: 'Assigned trip, stops, and large driver actions',
  },
  {
    label: 'Parent Demo',
    path: '/parent',
    description: 'Assigned bus status for one mock student',
  },
];

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-700">
            Demo access
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-navy-900">Choose a portal</h1>
          <p className="mt-3 text-gray-600">
            Authentication is mocked for Milestone 1. Pick a role to open the demo UI.
          </p>
          <div className="mt-6 space-y-3">
            {demoRoles.map((role) => (
              <button
                key={role.path}
                type="button"
                onClick={() => navigate(role.path)}
                className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-navy-300 hover:bg-navy-50"
              >
                <span className="block text-lg font-bold text-navy-900">{role.label}</span>
                <span className="mt-1 block text-sm text-gray-600">{role.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/reset-password"
              className="text-sm font-semibold text-navy-700 hover:text-navy-900"
            >
              Reset password
            </Link>
            <Button type="button" variant="ghost" onClick={() => navigate('/')}>
              Back to site
            </Button>
          </div>
        </Card>
      </main>
    </PublicLayout>
  );
}
