# Android password-recovery retry repair

## Finding and resulting behavior

The native deep-link handler marked a URL handled before Supabase confirmed the
recovery exchange. A failed cold-start exchange therefore caused subsequent taps
on the same email link to be ignored for the lifetime of the app process. Different
links could also exchange concurrently, allowing an older delayed response to
finish after a newer request.

After repair, callbacks for the same pending link share one operation. Different
links are processed in opening order. Only a confirmed exchange is remembered as
successful; a failed link can be explicitly reopened. There are no automatic
retries, no new Auth endpoints and no changes to the approved URL parser.
Supabase still validates credentials, expiry and one-time use. Reopening cannot
recover a consumed/expired code or a missing PKCE verifier; request a new email
when the provider cannot accept the original link. No verifier is copied or
restored to circumvent those rules.

The shared password-reset page now reads subsequent recovery results when it is
already open. It removes an old failure banner after a confirmed native exchange,
shows the latest safe failure after another failed link, and hides the password
form while native verification has failed. An already signed-in account is not
presented as a successful recovery result for a failed link. The failure marker
survives component remounts and StrictMode reads; only confirmed native recovery
clears it. Only sanitized feedback is stored; credentials and raw provider errors
are never included in the navigation path or feedback storage.

## Role acceptance

| Role | Expected behavior |
| --- | --- |
| Guardian and driver | Android recovery can be reopened after an unsuccessful attempt. Existing expiry, password policy, profile activation and enrolled-MFA rules remain. |
| School authority admin | Website recovery and mandatory MFA remain; a stored failed native verification must not expose the reset form merely because another session is present. |
| Transportation and platform admins | Existing web-only surface and MFA rules remain; no native portal access is added. |
| Retired school admin | Remains unsupported; this repair changes no role authorization. |

## Verification and limits

Four failures were reproduced against the original native handler: retry after
failed PKCE, access/refresh-token and token-hash callbacks, and concurrent distinct
links. The native handler tests also verify duplicate cold-start/foreground
callbacks, consumed-link suppression, unapproved destinations and sanitized
feedback. Shared-page tests use StrictMode and verify same-page success/failure
updates and hiding the form after failed verification.

Tests use synthetic mocked callbacks and local React rendering. No actual email
is sent, no existing identity/password is modified, and no production database
fixtures or financial actions are used. This does not close the owner's deferred
real-account or physical-device acceptance.

This is application code only: human review/merge, normal web deployment and a
new Android build/release are required. No SQL migration or protected database
installation is needed. Publishing the website does not update installed Android
binaries or publish a Google Play release.

References:
- https://capacitorjs.com/docs/apis/app
- https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession

## Final validation

On the final source, `pnpm test` passed 1,539 tests (1,069 web, 32 mobile,
438 release). Typecheck, lint, root/web/mobile build, a subsequent mobile build
and Android sync all passed. Generated store artwork was restored; only recovery
code, regression tests and this evidence record are proposed for review.
