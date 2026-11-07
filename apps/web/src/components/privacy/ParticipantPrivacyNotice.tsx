import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export type ParticipantRole = 'driver' | 'guardian';

/**
 * A brief, device-local notice acknowledgement, NOT contractual acceptance or
 * consent to location tracking or notifications. The full notices stay public.
 */
export const PARTICIPANT_NOTICE_VERSION = 'participant-privacy-2026-11-05-v1';

export function participantNoticeStorageKey(profileId: string, role: ParticipantRole): string {
  return `safebus.participantNotice:${role}:${profileId}`;
}

export function needsParticipantNotice(
  storedVersion: string | null,
  version = PARTICIPANT_NOTICE_VERSION,
): boolean {
  return storedVersion !== version;
}

export function ParticipantPrivacyNotice({
  profileId,
  role,
}: {
  profileId: string;
  role: ParticipantRole;
}) {
  const key = participantNoticeStorageKey(profileId, role);
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      return !needsParticipantNotice(window.localStorage.getItem(key));
    } catch {
      return false;
    }
  });

  if (acknowledged) return null;

  function acknowledge() {
    try {
      window.localStorage.setItem(key, PARTICIPANT_NOTICE_VERSION);
    } catch {
      // The app remains usable if device storage is unavailable; show again
      // next session rather than implying that a durable record was saved.
    }
    setAcknowledged(true);
  }

  const driver = role === 'driver';
  return (
    <Card className="mb-5 p-4 sm:p-5" data-testid="participant-privacy-notice">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-action)]">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="font-bold text-[var(--color-heading)]">
              {driver ? 'Driver privacy at a glance' : 'Guardian privacy at a glance'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {driver
                ? 'During an active trip, your phone sends bus location, including in the background. Authorized school authority staff and linked guardians see the bus, not your off-shift location. Location collection stops when the trip ends; earlier offline updates may still sync.'
                : 'SafeBus tracks the assigned bus, not your child or your phone. Your school authority controls which students you can view. Notifications are optional; contact the authority to correct a student link.'}
            </p>
          </div>
          <Link
            to={driver ? '/privacy#drivers' : '/privacy#guardians'}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-action)] underline underline-offset-4"
          >
            Read the full {driver ? 'driver' : 'guardian'} privacy notice
          </Link>
          <div>
            <Button type="button" onClick={acknowledge}>
              I understand
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            This acknowledges that you saw this notice. It does not change your
            permissions or sign a school authority contract.
          </p>
        </div>
      </div>
    </Card>
  );
}
