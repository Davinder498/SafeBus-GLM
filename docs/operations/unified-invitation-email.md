# SafeBus unified invitation email and account activation

## Scope

One approved role-neutral invitation email serves district administrators, bus drivers,
and guardians. Roles are determined from server-authorized SafeBus profiles; the email
does not carry role, tenant, student, bus or route identifiers.

- Invite email source: `supabase/templates/invite.html`
- Recovery/resend email source: `supabase/templates/recovery.html`
- Initial invite callback: `https://safebus.kids/accept-invitation`
- Web activation: `apps/web/src/pages/AcceptInvitationPage.tsx`
- Recovery/resend activation: `apps/web/src/pages/UpdatePasswordPage.tsx`
- Mobile handoff: `apps/web/src/components/auth/MobileAccountReady.tsx`

## Hosted Supabase Auth email setup (manual dashboard action required)

The Supabase database connector **cannot** read or update the hosted Auth email
template configuration, so these files are versioned but are **not automatically
deployed** by GitHub, SQL migrations, Netlify or Resend.

In the appropriate SafeBus Supabase project:

1. Open Authentication → Email Templates → Invite user.
2. Set subject: `You're invited to SafeBus`.
3. Paste the exact contents of `supabase/templates/invite.html` and save.
4. Open Authentication → Email Templates → Reset password.
5. Set subject: `Set or reset your SafeBus password`.
6. Paste the exact contents of `supabase/templates/recovery.html` and save.
7. Preserve `{{ .ConfirmationURL }}` and `{{ .Email }}`. Do not hard-code
   an invitation, recovery, secret, or user-specific URL.
8. In Authentication → URL Configuration, confirm exact redirects:
   `https://safebus.kids/accept-invitation` and
   `https://safebus.kids/update-password`.
9. Confirm Netlify's server-only `SAFEBUS_INVITE_REDIRECT_URL` points to
   `https://safebus.kids/accept-invitation`.
10. Keep verified Supabase→Resend SMTP settings unchanged. Disable link
    tracking/rewriting for one-time authentication URLs.

**Important:** The reset-password template is intentionally not labeled only
as an invitation: it also serves ordinary password-reset emails. The existing
onboarding service uses Supabase's `resetPasswordForEmail` to resend some
invitations.

## Recipient experience

- First invitation: use Supabase confirmation URL, accept page, password setup,
  `complete_invited_account`, then existing authorized role destination.
- Administrator: existing MFA/billing web onboarding preserved.
- Driver/guardian opening on web: activation completes, session is signed out
  on the wrong surface, and a mobile-app handoff card appears.
- Resent invitation arriving via recovery email: recovery page checks that
  profile is still `invited` and calls the same existing
  `completeInvitation(password)` flow. This enforces the password policy and
  invokes server-side `complete_invited_account`.
- Ordinary password reset for an active user: only `updatePassword`, with no
  invitation activation.
- No unverified app-download URL or cross-platform deep link is introduced.
  The Android build currently only registers password-recovery deep links.

## Validation

Run locally or in an authorized CI runner:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test tests/smoke/invitation-password-activation.spec.ts --project=desktop-chromium
```

Use DEV identities (not live guardians/children) to check first invitations,
resends, cancelled/expired links, full web and Android handoff, district admin
MFA, and genuine password resets. The GitHub branch alone cannot confirm live
SMTP delivery or hosted Supabase template state.
