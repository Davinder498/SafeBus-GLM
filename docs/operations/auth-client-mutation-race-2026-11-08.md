# SafeBus client password/session mutation hardening — November 8, 2026 (Alberta)

**Scope:** Authenticated password changes and invitation activation on the web/mobile-shared React Auth provider and the existing isolated current-password-proof service. Code and synthetic regressions only; no production DB, Auth settings, accounts, credentials, emails or Stripe changes.

## Security finding

SafeBus already bound profile and MFA loading to the current session revision and verified current sessions before privileged server operations. However, a sensitive password operation could pause while a password-policy or isolated credential-proof request was in flight. If the application session was replaced during that time, the next unguarded `auth.updateUser` or `complete_invited_account` could be invoked using the newly current account. This was a potential client-side account-switch race, **not evidence of a successful cross-user password mutation**.

## Implemented behavior

- Current-password change binds the verified server identity (`getUser`) to the initial local session/token (`getSession` for comparison only). After completing isolated credential verification and locally signing out of the temporary proof session, it rechecks the active application session before attempting `updateUser`. A sign-out, identity switch or token replacement aborts safely; no password content enters an audit log.
- Invitation setup validates that its initial session still matches the currently observed session after `getSession` and after the asynchronous password-policy check. After the password update it tolerates `USER_UPDATED` rotating a token for the *same account*, but refuses to activate a different account if it switched during the update.
- Ordinary password reset similarly checks the captured session revision after the policy request and before the mutation, without rejecting a legitimate token rotation that follows a successful password update.
- Existing role checks, administrator MFA, guardian/driver optional MFA, district-only product roles, RLS, API session enforcement and notification controls remain unchanged.

## Synthetic acceptance

The existing isolated service tests now exercise mismatched verified identity, account switch after proof, same-user token replacement, and a failed post-proof session recheck. Auth provider tests exercise sign-out and second-user sign-in during pending password policy, wrong-user invitation activation after a password update, and successful same-account token rotation. Supported roles remain district tenant admin, transportation admin, platform admin, guardian and driver; retired `school_admin` remains rejected. A denied operation must not call the password update or activation RPC or restore previous profile/MFA state.

The tests do **not** establish hosted Auth acceptance, signed-device behavior, supplier terms, approval to publish the district MSA/DPA, or legal/commercial launch readiness. No personal account, email or password should be used as a production QA fixture.

References: [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions), [getSession local-token caveat](https://supabase.com/docs/reference/javascript/auth-getsession), [getUser verified user](https://supabase.com/docs/reference/javascript/auth-getuser), and [current-password update](https://supabase.com/docs/guides/auth/passwords).
