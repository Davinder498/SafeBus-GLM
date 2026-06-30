import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function ResetPasswordPage() {
  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <h1 className="text-3xl font-bold tracking-normal text-navy-900">Reset password</h1>
          <p className="mt-3 text-gray-600">
            Password reset is a frontend placeholder for this milestone.
          </p>
          <label className="mt-6 block text-sm font-semibold text-gray-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="transportation@example.ca"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
          <Button type="button" className="mt-5" fullWidth>
            Send reset link
          </Button>
          <Link
            to="/login"
            className="mt-5 inline-flex text-sm font-semibold text-navy-700 hover:text-navy-900"
          >
            Return to login
          </Link>
        </Card>
      </main>
    </PublicLayout>
  );
}
