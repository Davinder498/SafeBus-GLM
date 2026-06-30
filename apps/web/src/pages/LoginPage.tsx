import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const profile = await signIn(email, password);
      navigate(getDashboardPath(profile.role), { replace: true });
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-700">
            Account access
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-navy-900">
            Sign in to SafeBus
          </h1>
          <p className="mt-3 text-gray-600">
            Use your email and password. Demo accounts will be configured separately.
          </p>

          {(configError || error) && (
            <div className="mt-5 rounded-lg border border-danger-100 bg-danger-50 p-4 text-sm font-medium text-danger-700">
              {configError ?? error}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                placeholder="transportation@example.ca"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            </div>
            <Button type="submit" fullWidth disabled={submitting || Boolean(configError)}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

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
