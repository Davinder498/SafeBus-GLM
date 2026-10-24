# Live onboarding and billing reconciliation — 2026-10-24

## Source synchronization

Fetched GitHub before the follow-up work and again at the owner's explicit sync
request. The task branch baseline, `origin/main`, and Netlify's published
production deployment all resolve to `d04316eba828a96335cff4ef79fd65e5f2436a17`.
Netlify deployment `6adc127dd3c729e2d5a1ec5d` was published at
2026-10-24T02:06:41.499Z from `main`.

The local `main` branch was six commits behind. It has now been fast-forwarded
to that exact GitHub revision. No local-only main commits were discarded, no
force reset was used, and the in-progress follow-up edits were saved in a named
stash before reconciliation and reapplied to the feature branch afterward.

## Confirmed deployed billing failure

Netlify `tenant-subscriptions` historical logs show `resource_missing` at
02:11:16, 02:14:17 and 02:15:37 UTC. Read-only inspection of the production
Functions environment found that `STRIPE_SAFEBUS_PRODUCT_ID` contains the
Stripe **account** ID (`acct_…`), rather than a product ID.

The signed-in live Stripe Dashboard confirms the existing active product:

- **SafeBus Subscription:** `prod_VSW0zWChQJsTdL`.
- Monthly CAD price: `price_1URbJ3JayDoqdBIzNBcBJyNj`, CA$1.99.
- Annual CAD price: `price_1URbJ3JayDoqdBIzCTnaHtFq`, CA$20.29.

The owner explicitly authorized this bounded configuration-only repair outside
the general release workflow. Changed only the production value of
`STRIPE_SAFEBUS_PRODUCT_ID` to `prod_VSW0zWChQJsTdL` and rebuilt the reviewed
production revision so Functions pick it up. Server keys, webhook, portal
configuration, branding, product, prices, Auth identities and database were
preserved.

Netlify deployment `6adc1a4035675de2dbb3067f` is ready and was published at
2026-10-24T02:39:41.071Z. Its commit is exactly
`d04316eba828a96335cff4ef79fd65e5f2436a17`. The mobile/UI follow-up branch is
not part of this deployment. A successful rebuild establishes deployment of the
configuration repair. A subsequent live browser check confirmed the monthly
CA$1.99 and annual CA$20.29 options load for the existing school authority admin.
Checkout correctly required a recent sign-in; subscription confirmation and
webhook acceptance remain separate checkpoints.

No secrets were copied into the repository or frontend. Netlify masks the
server key during configuration inspection; no key rotation is proposed.

## Existing account checkpoint

Bounded production read-only transactions with local statement/lock timeouts and
ROLLBACK confirm that the canonical origin is allowed and the owner-created
Test School District and its first school authority admin are active. No billing
customer or subscription mapping existed at the checkpoint. Those observations
verify onboarding activation, not checkout, card acceptance or webhook delivery.

## Live acceptance to complete after correction

1. Reopen billing as the existing school authority admin, complete MFA and any
   required recent sign-in, and verify both live CAD price choices load.
2. Select one bus and review the normal new-authority trial Checkout. The app
   sets a 14-day trial in Checkout; product-level "No trials" does not remove it.
3. The owner reviews the exact recurring price and completes payment-method
   entry and the final live subscription confirmation. Do not enter a test card
   into live mode, skip the trial, or induce a real charge as an automated check.
4. Verify signed webhook receipt, the tenant-scoped subscription projection,
   trial end, one-bus allowance and return-page readiness. Do not infer success
   from the browser redirect alone.
5. A trial with zero due now verifies card collection/subscription creation;
   it does not establish a successful paid invoice. Record any separately
   authorized charge and paid-invoice verification independently.

This record does not authorize new QA accounts, emails, migrations, commercial
launch, payment, merge or deployment.

## Local validation and coverage

- `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test` passed. The final
  test run includes 566 web tests, two mobile unit tests and 364 release checks.
  Release PostgreSQL checks use their existing embedded local harness; no hosted
  fixture runner or migrations were executed.
- The native mobile browser suite passed all 63 tests, including new account
  forms at 320/390/430px and landscape. This is browser/device emulation, not a
  physical iOS or Android keyboard/safe-area certification.
- Website invitation/password and responsive account tests passed 14 tests;
  six duplicated desktop viewport sweeps are intentionally skipped. The mobile
  sweep includes mismatch validation, password activation, required MFA,
  authenticator enrollment and reset-password layout at 320/375/390/430/768px
  and 667px landscape.
- Existing billing journeys passed 13 checks. The added catalog failure/retry
  check exposed an undersized navigation button and passed on desktop and at
  320px after the shared navigation controls were enlarged. It verifies no
  checkout is started by catalog recovery and exercises opening/closing the
  mobile drawer. Service and handler regressions passed all 31 focused checks.
- Responsive assertions measure visible control containment, label clipping
  and touch targets as well as page overflow. The former invitation fixture
  incorrectly supplied an already-MFA-verified session; it now starts at AAL1.
  Screenshots are retained in local/CI Playwright artifacts for visual review.

Local browser fixtures are synthetic and network-bounded. They do not prove
Stripe live checkout, a paid invoice or signed webhook delivery. The Chrome
connection disconnected during the owner's fresh sign-in; final live acceptance
must resume from the owner's signed-in session and be recorded separately.
