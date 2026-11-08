# SafeBus participant invitation terms — reviewed implementation boundary

**Status as of November 8, 2026:** Owner-approved driver/guardian Terms of Use **2026.1 published**, participant migration installed and verified in production, [PR #409](https://github.com/Davinder498/SafeBus-GLM/pull/409) and [PR #410](https://github.com/Davinder498/SafeBus-GLM/pull/410) merged. [Signed Android 1.0.8 (code 9)](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42473404481) built successfully; owner reports uploading its AAB to Play Internal Testing, but Play rollout/installation and actual signed-session invitation acceptance have **not** been independently verified. Owner has **deferred physical Android app testing**. This is **not** customer contract publication or commercial/pilot launch approval.

## Approved user journey

1. School authority administrator: existing invitation → password/MFA → exact MSA, DPA, Order Form and schedules → authorized tenant-admin e-sign → billing. The district contract is unchanged.
2. Driver and guardian: mobile invitation → password/optional enrolled MFA → one role-appropriate Terms of Use + Privacy Notice screen → two independently affirmative checkboxes → server-recorded acceptance → dashboard.
3. The Privacy Notice acknowledgment is **not** consent to active-trip location permissions, employer BYOD arrangements, email or push notifications. The applicable independent controls remain.

## Source and safety

- The agreement's Terms of Use must be a **separately selected**, final approved acceptable_use version from the existing immutable publisher. An eight-document district catalog update does not silently publish mobile terms.
- Platform administrator MFA and session checks protect the publication action.
- A private, RLS-enabled table records only profiles created as drivers/guardians **after** migration (or newly changed to those roles). Older active profiles remain grandfathered, with their existing device-local informational privacy card.
- A separate immutable private receipt preserves the exact Terms body/version/SHA-256, actor profile/tenant/role/session, time, notice version/link and the two true acknowledgments. No direct anonymous or authenticated table grants.
- Public RPCs resolve the actor from the verified Auth session. They do not trust profile/tenant IDs supplied by the browser. The agreement view is fail-closed for missing or unpublished content.
- Frontend protects normal participant routes from skipping the agreement step, but this frontend gate is **not** a substitute for independent server authorization of bus, route or student data.
- No draft Terms of Use may be published. Legal wording, supplier disclosures, privacy program, customer authority, taxes, pricing and operational go-live approvals remain separate.

## Rollout state and remaining installation boundary

The frontend flag `participantAgreementOnboardingEnabled` was changed to **true** by merged PR #410, after the protected migration and approved participant Terms 2026.1 publication. The separate native mobile route `/participant/agreements` is registered; CI passed mobile browser acceptance tests and signed Android build 1.0.8. Production Supabase has the new receipt/requirement tables and public RPCs. Existing participant profiles that predate migration remain grandfathered by the database; acceptance must never be fabricated.

**Outstanding risk:** a signed Android bundle and simulated browser flows do not prove that every installed phone has received the new gate. New invited participants using an older mobile build may not see the current Terms screen, and the SQL requirement/receipt itself does not authorize blocking every transportation read RPC. **Do not invite new drivers or guardians until the exact supported Android build is distributed to authorized testers and a real signed-session acceptance and denial test has been completed using approved isolated/synthetic identities.** Owner has deferred this test. Driver/guardian session/privacy safeguards remain independent, and no school-authority MSA/DPA publication follows from participant Terms publication.

## Verified milestones and deferred verification

1. **Completed:** reviewed migration and UI implementation; owner-approved participant wording; production participant tables/RPC/trigger confirmed installed; immutable `acceptable_use` 2026.1 published; PRs #409/#410 merged; CI browser/mobile tests and Android signed bundle 1.0.8 build passed.
2. **Not independently verified:** Google Play Internal Testing release publication and installation, actual hosted new-profile invitation/password/MFA to agreement acceptance with a legitimate scoped user, role/tenant denial, notice display and no bypass on an older app version.
3. **Deferred by owner:** physical Android field and app testing, including actual invitation/acceptance; do not mark accepted or send new real participant invites during this gap.
4. **Before rollout sign-off:** verify approved test identities without production student/driver data, receipt idempotency and exact text/version/hash, failed/revoked session refusal, account grandfathering, OS/device permission separation, and older-app protection strategy. All transportation-data RPCs must retain independent server-side authorization; the UI route alone cannot prove legal acceptance enforcement.
5. **Separate:** final school-authority MSA/DPA/Order Form and schedules, supplier account evidence, insurance and commercial launch authorization stay unpublished/unapproved. See [November 8 commercial review](../governance/phase-3/business-pack/supplier-dpa-insurance-contract-review-2026-11-08.md).

## Privacy/security limitation for release review

The agreement screen is a user-journey gate. The recorded acceptance is server-authoritative, but the migration does not put a new Terms check into all transportation data RPCs or offline driver ingestion. The reviewer must explicitly decide whether further server-side access enforcement is necessary under the chosen customer contract and release policy; do not misrepresent a UI redirect as an API security boundary. Preserve active-trip offline handling.
