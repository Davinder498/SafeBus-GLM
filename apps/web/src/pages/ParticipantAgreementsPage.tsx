import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { FileCheck2, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/useAuth';
import { getDashboardPath } from '@/contexts/AuthContext';
import {
  PARTICIPANT_NOTICE_VERSION,
  participantNoticeStorageKey,
} from '@/components/privacy/ParticipantPrivacyNotice';
import {
  acceptMyParticipantAgreement,
  getMyParticipantAgreement,
  type ParticipantAgreementStatus,
} from '@/services/participantAgreementService';

export function ParticipantAgreementsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role;
  const [agreement, setAgreement] = useState<ParticipantAgreementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [noticeChecked, setNoticeChecked] = useState(false);
  const [retry, setRetry] = useState(0);
  const driver = role === 'driver';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMyParticipantAgreement();
      setAgreement(result);
    } catch (cause) {
      setAgreement(null);
      setError(cause instanceof Error ? cause.message : 'Could not load the agreement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setAgreement(null);
    setError(null);
    void getMyParticipantAgreement()
      .then(result => { if (current) setAgreement(result); })
      .catch(cause => { if (current) setError(
        cause instanceof Error ? cause.message : 'Could not load the agreement.'
      ); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profile?.id, retry]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || (role !== 'driver' && role !== 'guardian') ||
        agreement?.status !== 'pending' || !agreement.terms ||
        !termsChecked || !noticeChecked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acceptMyParticipantAgreement({
        documentId: agreement.terms.id,
        sha256: agreement.terms.sha256,
        acceptTerms: termsChecked,
        acknowledgeNotice: noticeChecked,
      });
      // Avoid showing the older device-local first-use notice immediately
      // after the authenticated, server-recorded acknowledgment.
      try {
        window.localStorage.setItem(
          participantNoticeStorageKey(profile.id, role), PARTICIPANT_NOTICE_VERSION,
        );
      } catch {
        // No false claim about persistent device storage.
      }
      navigate(getDashboardPath(role), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Terms acceptance failed.');
      setTermsChecked(false);
      setNoticeChecked(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (role !== 'driver' && role !== 'guardian') return null;

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100svh-180px)] w-full max-w-3xl items-start px-4 py-6 sm:items-center sm:px-6 sm:py-12">
        <Card className="w-full space-y-5 p-5 sm:p-8" data-testid="participant-agreement">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-action)]">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">SafeBus account setup</p>
              <h1 className="text-2xl font-bold text-[var(--color-heading)]">
                Terms of Use and Privacy Notice
              </h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            {driver
              ? 'Review the rules for using SafeBus as a driver and the notice about active-trip phone location.'
              : 'Review the rules for using SafeBus as a guardian and the notice about bus visibility and student links.'}
          </p>
          {error && <p role="alert" className="rounded-lg border border-[var(--color-danger-outline)] p-4 text-sm text-[var(--color-danger-text)]">{error}</p>}
          {loading && <p role="status" className="text-sm">Checking current approved terms…</p>}
          {!loading && !agreement && (
            <Button type="button" variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry</Button>
          )}
          {!loading && agreement?.status === 'not_published' && (
            <div className="space-y-3" role="status">
              <p className="text-sm">Your school authority's approved Terms of Use are not available yet. Contact SafeBus support to finish account setup.</p>
              <a className="font-semibold text-[var(--color-action)] underline" href="mailto:info@safebus.kids">Contact support</a>
              <Button type="button" variant="secondary" onClick={() => setRetry(value => value + 1)}>Check again</Button>
            </div>
          )}
          {!loading && (agreement?.status === 'grandfathered' || agreement?.status === 'accepted') && (
            <div className="space-y-3">
              <p role="status" className="text-sm font-semibold">Your account is ready.</p>
              <Button type="button" fullWidth onClick={() => navigate(getDashboardPath(role), { replace: true })}>Continue to SafeBus</Button>
            </div>
          )}
          {!loading && agreement?.status === 'pending' && agreement.terms && agreement.notice && (
            <form onSubmit={event => void accept(event)} className="space-y-5">
              <section aria-labelledby="participant-terms-heading">
                <h2 id="participant-terms-heading" className="font-bold text-[var(--color-heading)]">
                  {agreement.terms.title}
                </h2>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Version {agreement.terms.version} · Document SHA-256 {agreement.terms.sha256}
                </p>
                <div tabIndex={0} role="region" aria-label="Complete Terms of Use"
                  className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm leading-6">
                  {agreement.terms.body}
                </div>
              </section>
              <section className="space-y-2" aria-labelledby="participant-notice-heading">
                <h2 id="participant-notice-heading" className="font-bold text-[var(--color-heading)]">Privacy Notice</h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {driver
                    ? 'The assigned bus is tracked during active trips. Location may be collected in the background and previously queued updates may still sync.'
                    : 'SafeBus tracks the bus, not your child or your phone. Only authorized student links determine what you can view.'}
                </p>
                <Link className="inline-flex min-h-11 items-center font-semibold text-[var(--color-action)] underline underline-offset-4"
                  to={agreement.notice.url}>Read the full {driver ? 'driver' : 'guardian'} Privacy Notice</Link>
              </section>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" required
                  checked={termsChecked} onChange={event => setTermsChecked(event.target.checked)} />
                I have reviewed and agree to the Terms of Use shown above.
              </label>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" required
                  checked={noticeChecked} onChange={event => setNoticeChecked(event.target.checked)} />
                I have read and understand the {driver ? 'driver' : 'guardian'} Privacy Notice.
              </label>
              <p className="text-xs leading-5 text-[var(--color-text-muted)]">
                Your acceptance is recorded with the exact Terms version and time. Privacy Notice acknowledgment
                is not consent to optional notifications or device location permissions. Your school authority
                controls eligibility and authorized transportation records.
              </p>
              <Button type="submit" fullWidth size="lg" loading={busy}
                disabled={!termsChecked || !noticeChecked || busy}>
                <FileCheck2 className="h-4 w-4" aria-hidden /> Agree and continue
              </Button>
            </form>
          )}
          <div className="border-t border-[var(--color-border)] pt-4">
            <Link to="/privacy" className="text-sm font-semibold text-[var(--color-action)] underline">Privacy policy</Link>
          </div>
        </Card>
      </main>
    </PublicLayout>
  );
}
