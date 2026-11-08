import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate } from 'react-router';
import { AppLoadingScreen } from '@/components/ui/AppLoadingScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { getMyParticipantAgreement } from '@/services/participantAgreementService';

// Positive server verification is cached only within the current Auth session
// object. Offline route changes after successful verification must not strand
// a working driver trip; no localStorage flag can authorize an unsigned user.
const verifiedSessions = new WeakMap<Session, Set<string>>();

/**
 * Invitation Terms gate for driver/guardian dashboards.
 * Acceptance is validated with a fresh, signed Supabase session; never trust
 * localStorage as authorization. New profiles cannot skip the screen by URL.
 */
export function ParticipantAgreementGate({
  profileId,
  role,
  tenantId,
  session,
  children,
}: {
  profileId: string;
  role: 'driver' | 'guardian';
  tenantId: string | null;
  session: Session;
  children: ReactNode;
}) {
  const [result, setResult] = useState<{
    profileId: string;
    status: 'allowed' | 'required' | 'error';
  } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    // If an existing user changes role or district, do not reuse an earlier
    // grandfathered or signed grant from the same Auth session.
    const key = [profileId, role, tenantId ?? ''].join(':');
    if (verifiedSessions.get(session)?.has(key)) {
      setResult({ profileId, status: 'allowed' });
      return () => { current = false; };
    }
    setResult(null);
    void getMyParticipantAgreement()
      .then(agreement => {
        if (!current) return;
        const allowed = !agreement.required || agreement.status === 'accepted';
        if (allowed) {
          const verified = verifiedSessions.get(session) ?? new Set<string>();
          verified.add(key);
          verifiedSessions.set(session, verified);
        }
        setResult({ profileId, status: allowed ? 'allowed' : 'required' });
      })
      .catch(() => {
        if (current) setResult({ profileId, status: 'error' });
      });
    return () => { current = false; };
  }, [profileId, role, tenantId, retry, session]);

  if (!result || result.profileId !== profileId) return <AppLoadingScreen />;
  if (result.status === 'required') return <Navigate to="/participant/agreements" replace />;
  if (result.status === 'error') return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100svh-160px)] max-w-md items-center px-4 py-8">
        <Card className="w-full space-y-4 p-6">
          <h1 className="text-xl font-bold text-[var(--color-heading)]">Account verification unavailable</h1>
          <p role="alert" className="text-sm text-[var(--color-text-muted)]">
            SafeBus cannot securely verify your current Terms of Use status.
            Check your connection and retry.
          </p>
          <Button type="button" onClick={() => setRetry(value => value + 1)}>Try again</Button>
        </Card>
      </main>
    </PublicLayout>
  );
  return children;
}
