import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bus, AlertCircle, ShieldCheck } from 'lucide-react';
import { getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

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
    <div className="flex min-h-screen bg-slate-50">
      {/* Left brand panel — hidden on small screens */}
      <div className="relative hidden w-1/2 overflow-hidden bg-navy-900 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(at 20% 20%, rgb(37 99 235 / 0.4) 0px, transparent 50%), radial-gradient(at 80% 80%, rgb(250 204 21 / 0.2) 0px, transparent 50%)',
          }}
        />
        <div className="relative p-10">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
              <Bus className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">SafeBus Alberta</span>
          </Link>
        </div>
        <div className="relative px-10 pb-10">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Live bus visibility for Alberta schools.
          </h2>
          <p className="mt-4 max-w-md text-navy-100">
            Track the bus, not the child. Operations, driver, and guardian portals in one place.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-navy-200">
            <ShieldCheck className="h-4 w-4 text-success-400" />
            Privacy-first by design
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-6 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          {/* Mobile brand */}
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-700 text-white">
              <Bus className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">SafeBus Alberta</span>
          </Link>

          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-600">Account access</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">
            Use your email and password. Demo accounts will be configured separately.
          </p>

          {(configError || error) && (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{configError ?? error}</span>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="transportation@example.ca"
              />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" fullWidth size="lg" loading={submitting} disabled={Boolean(configError)}>
              Sign in
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between">
            <Link
              to="/reset-password"
              className="text-sm font-semibold text-navy-600 hover:text-navy-800"
            >
              Reset password
            </Link>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Back to site
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}