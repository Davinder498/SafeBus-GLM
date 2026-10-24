# Settings launch cleanup — 2026-10-24

This change combines the billing layout, school authority notification defaults,
sidebar privacy cleanup, concise card copy, and optional guardian/driver MFA.
Administrator MFA remains mandatory. No additional privacy approval is required
when a school authority is provisioned under the owner's approved platform policy.

## Behaviour

- Billing opens in SafeBus. Subscription fields share one card with labels on the
  left and values on the right. Plan editing, invoice history, payment details,
  and cancellation remain available. Invoice documents and payment management use
  authenticated Stripe links. Bus configuration is reached through Buses.
- Remove the duplicate sidebar Privacy Notice; retain it in the account menu.
- Remove repetitive card subtitles, option captions, and technical map footnotes.
  Retain live statuses, estimates, dates, actual data, errors, essential task
  instructions, location disclosures, and billing/destructive consequences.
- Guardians and drivers change notification choices with a valid session. An old
  sign-in alone does not block a preference save. Guardian/student access changes
  continue to require recent authentication.
- The account menu's Account security entry opens the MFA setting. Guardians and
  drivers can enable an authenticator, verify it at subsequent sign-in, and remove
  it after entering a fresh code. Enrollment remains optional. Pending unverified
  enrollment does not lock an account. Existing administrator requirements remain.
- Enrolled guardian/driver accounts require AAL2 through both route guards and
  server authorization. Restrictive policies narrow existing RLS grants; an API
  pre-request check covers SECURITY DEFINER RPCs. The minimal bootstrap exception
  allows own-profile reads, own-session registration, and own auth audit events
  before completing the challenge. Session revocation checks remain enforced.

## Database release

### SQL editor copy correction

The reported SQL editor errors (`42601` at `Owner`, `Guardians`, and `A`)
occurred because the executed text started with explanatory prose without its
SQL comment markers. Read-only hosted verification confirmed none of the three
changes had been applied: defaults were still pending/off, the notification
exception was absent, and there were no optional-MFA helper or policies.

The three pending files now start directly with executable SQL and contain no
standalone explanatory line comments. Their executable statements are unchanged.
Use each complete raw `.sql` file, in the order below; do not copy rendered prose
or an excerpt. The explanatory context remains in this document and the PR.

The exact corrected files were also executed together against BusSafe in a
5-second statement / 1-second lock bounded transaction and rolled back. All
three changes succeeded inside that rehearsal, including the 67 MFA policies.
A separate read-only check confirmed the original defaults and guards were
restored and no optional-MFA helper or policies remained. This was verification,
not a persistent deployment.

Forward files remain in `supabase/migrations/pending` for the protected release
workflow. Do not replay historical migrations or deploy only a cosmetic browser
fix for the preference error.

1. `20261024203929_launch_ready_notification_defaults.sql` — previously prepared
   notification availability defaults and the narrowly scoped owner account repair.
2. `20261024215400_notification_preference_auth_scope.sql` — replace the existing
   private mutation guard. Exempt only the authenticated guardian's own five
   notification/timestamp fields, after checking active session, profile, guardian,
   tenant and unchanged access fields. Preserve the hosted invited-to-active
   first-account activation exception and the existing administrator MFA gate.
3. `20261024215633_optional_recipient_mfa.sql` — add the optional MFA predicate,
   restrictive policies, and extend the current PostgREST session hook. Coordinate
   this with the browser/mobile MFA flow so enrolled users have a challenge screen.

Use the approved recovery and release process, human merge review, protected
environment, and forward-file adoption rules. These changes do not authorize
merging or bypassing deployment protections. A school authority does not need
another manual approval after the platform update has been released.

## Verification

- Embedded PostgreSQL executes the actual forward SQL with synthetic local rows.
  It tests preference-only changes, access-bearing changes, inserts/deletes,
  inactive accounts/sessions, cross-account attempts, unknown future access fields,
  first-time activation, optional-MFA API enforcement, and restrictive RLS.
- React tests cover optional enrollment by role, mandatory administrator MFA,
  sign-in challenge routing, verification, and fresh-code authenticator removal.
- Local browser tests use intercepted Supabase traffic, never live identities,
  delivery providers, or billing actions. They exercise MFA for both mobile roles,
  preferences, bus details, billing, privacy navigation, accessibility and layout.
- Read-only hosted reconciliation confirmed the live private guard and its
  first-activation exception, current API hook and session validator, and guardian
  link triggers. DDL event triggers were inspected before rehearsal: relevant
  schema reload notifications are transactional and roll back.
- Both new auth migrations ran together against the existing BusSafe project in
  one bounded transaction with a 5-second statement timeout, 1-second lock timeout,
  and final ROLLBACK. The rehearsal installed 67 restrictive policies and preserved
  first activation. No account fixtures, outbox writes, or notifications were used.
- A separate read-only transaction confirmed zero new policies, no new MFA helper,
  and both original guards restored. No persistent database changes were applied.
