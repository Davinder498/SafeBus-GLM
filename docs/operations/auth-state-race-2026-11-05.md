# Authentication state race correction

## Finding and behavior

The Auth provider did not bind asynchronous profile and MFA results to the
session that started them. A delayed startup lookup, profile response, MFA
response or sign-in result could replace newer state after sign-out or account
switching. An old profile failure could also clear a newly loaded account. A
pending profile could restore local account state after revocation when the
Auth sign-out request failed.

Before: if account A's profile request completed after account B signed in, the
provider could pair B's session with A's profile and role. An old MFA result could
similarly restore A's assurance state. Server-side session, role, MFA and tenant
checks remained required; this is a client state isolation and navigation defect,
not evidence that the server granted another account's data.

After: observe session changes synchronously and clear the previous profile/MFA
state. Every asynchronous startup, profile and MFA completion checks its captured
session revision before publishing state. Older errors and loading completions
are discarded too. Manual refreshes reject when superseded, so their callers
cannot treat obsolete results as success. A delayed sign-in result cannot revive
a signed-out session. Revocation clears local authorization even if the network
sign-out fails. Provider cleanup invalidates pending work.

A refreshed token, MFA verification or user update that replaces the token loads
current state again. An ordinary USER_UPDATED event with the same token leaves
the current password form intact. The Auth event callback stays synchronous and
does not await Auth SDK methods. Invitation completion may legitimately replace
its token; its final profile commit checks the current account identity.

## Role acceptance

| Role | Expected behavior |
| --- | --- |
| School authority admin | Only the current account's profile and assurance may enter the administrator interface; existing mandatory MFA and tenant checks remain. |
| Transportation admin | Current profile/assurance only; no extra invitations, billing or authority administration permission. |
| Platform admin | Current profile/assurance only; existing mandatory MFA and platform scope remain. |
| Guardian | Current guardian account only; optional MFA stays optional until enrolled; linked-student access rules remain on the server. |
| Driver | Current driver account only; optional MFA and assigned-operation access remain. |
| Retired school admin | Unsupported role remains rejected. |

## Evidence and deployment boundary

Eight controlled asynchronous cases reproduced the problem against the unchanged
provider. All eight pass after repair. The expanded provider tests cover normal
sign-in/event overlap, supported roles, retired-role rejection, token refresh,
password-update/MFA events, old failures, manual refresh, pending loading and
revocation with a failed sign-out request. Tests use synthetic mocked Auth/profile
responses; no production identities, emails, notifications or payment actions
are used.

This is an application change only. It needs human PR review and merge, then the
normal deployment. It does not need a database migration or another protected SQL
installation. The current-session recent-authentication database repair from PR
382 was separately installed and verified by operational release run 42031746913.

Complete real-account invitation, recovery/MFA, notification and billing journeys,
manual accessibility acceptance and physical Android testing remain open. These
regressions do not claim those journeys have passed.

## Validation

The full suite passed: 1,066 web tests, 24 mobile tests and 438 release tests.
The final focused provider suite passed 25 cases (one same-account token-refresh
case was added after the full suite began). Typecheck, lint, root/web/mobile build,
a separate mobile build and Android sync passed. Generated store artwork was
restored rather than included in this PR. These checks establish local regression
coverage and bundle generation, not Play publication or physical-device results.
