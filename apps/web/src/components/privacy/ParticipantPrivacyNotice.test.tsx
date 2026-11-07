import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ParticipantPrivacyNotice,
  PARTICIPANT_NOTICE_VERSION,
  needsParticipantNotice,
  participantNoticeStorageKey,
} from './ParticipantPrivacyNotice';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  localStorage.clear();
  document.body.innerHTML = '';
});

async function render(role: 'driver' | 'guardian', profileId: string) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ParticipantPrivacyNotice profileId={profileId} role={role} />
      </MemoryRouter>,
    );
  });
  return host;
}

describe('participant privacy notice', () => {
  it('is a one-time, versioned notice scoped to a profile and role', () => {
    const key = participantNoticeStorageKey('account-a', 'guardian');
    expect(key).toContain('account-a');
    expect(needsParticipantNotice(null)).toBe(true);
    expect(needsParticipantNotice(PARTICIPANT_NOTICE_VERSION)).toBe(false);
    expect(participantNoticeStorageKey('account-b','guardian')).not.toEqual(key);
    expect(participantNoticeStorageKey('account-a','driver')).not.toEqual(key);
  });

  it('shows the guardian bus-only explanation without contractual or location consent', async () => {
    const host=await render('guardian','account-a');
    expect(host.textContent).toContain('tracks the assigned bus, not your child');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/privacy#guardians');
    const button=host.querySelector('button');
    expect(button?.textContent).toBe('I understand');
    await act(async () => button?.click());
    expect(host.querySelector('[data-testid="participant-privacy-notice"]')).toBeNull();
    expect(localStorage.getItem(participantNoticeStorageKey('account-a','guardian')))
      .toBe(PARTICIPANT_NOTICE_VERSION);
  });

  it('does not claim that driver notice acknowledgement authorizes location tracking', async () => {
    const host=await render('driver','account-a');
    expect(host.textContent).toContain('During an active trip');
    expect(host.textContent).toContain('earlier offline updates may still sync');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/privacy#drivers');
    expect(host.textContent).toContain('does not change your');
    expect(localStorage.getItem(participantNoticeStorageKey('account-a','driver'))).toBeNull();
  });
});
