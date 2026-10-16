# SafeBus naming verification — 2026-10-15

**Decision:** Owner selected SafeBus as the sole public product name.
**Operator:** Sachman Gold Inc., doing business as SafeBus, as stated by the owner.
**Base:** merged main `94d8fc6` (PR #278).
**Initial implementation:** `9fd7c64`; the validation table below records that candidate.

The implementation updates web/mobile labels, Android display strings, email
templates/default sender names, public privacy/operator text, current commercial
and PIA drafts, store artwork and four synthetic store screenshots. Publication
and health checks now expect SafeBus. Known database-generated legacy notification
copy is converted at the inbox/push boundary; migration SQL and stored records
remain intact. Tests cover conversion and preservation of unrelated text.

| Local validation                                                      | Result                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                      | Passed                                                                          |
| `pnpm lint`                                                           | Passed                                                                          |
| `pnpm build`                                                          | Passed for web and mobile                                                       |
| `pnpm test`                                                           | 383 web + 2 mobile + 348 release tests passed (733 total)                       |
| `pnpm migrations:verify`                                              | 125 immutable files verified                                                    |
| Website privacy-access and release-smoke Playwright specs, one worker | 18 passed across desktop and phone-sized Chromium                               |
| Android store Playwright capture suite                                | 4 passed; screenshots refreshed with synthetic data and placeholder credentials |
| Visual review                                                         | SafeBus feature graphic and guardian screenshot inspected                       |
| `git diff --check`                                                    | Passed                                                                          |

The first browser runs hit page-load/click timeouts during simultaneous builds
and embedded-Postgres tests. An overlapping rerun was stopped; the final runs
above passed after the heavy checks completed. A static release assertion that
expected the old push-builder source shape was replaced with a runtime assertion
for the legacy-to-SafeBus output. Historical SQL assertions remain unchanged.

Local candidate evidence digests after screenshot generation:

- Privacy: `300bae37c308f78e1689d5a4988840f894e8a9c323549e84f0f666d115c9ccf2`
- Android: `2f39894a73e18c322417f844757bfb7cf6d285eeeba13f01c8b163c9d41af96f`

These identify the local candidate, not an approved release. Protected workflows
must recompute evidence for their actual source/artifact. Privacy and Android
readiness records remain `not_approved`; no approval or historical digest is
replaced. No hosted query, production write, live email, DNS change, deployment
or store submission was performed. Native Android build/device acceptance and
live email delivery were not tested by these browser checks.

External sender-name overrides, Supabase Auth templates and any deployed/store
content require the normal release checks described in the
[naming decision](../product-naming.md). The connected Stripe sandbox already
uses SafeBus; no Stripe change was needed for this naming milestone.

## PR #279 browser correction

The [first CI run](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38836945215)
failed the phone-sized signed-in privacy accessibility scan. The dashboard main
content used a 300 ms animation starting at opacity zero. Axe sampled the notice
during that animation and reported insufficient contrast, including 3.86:1 for
text requiring 4.5:1. The failed check reproduced on its CI retries; the initial
local checks above had missed it.

Removed the main-content opacity animation. The existing page wrapper and layout
remain, and text renders at full opacity during navigation. No contrast rule,
assertion, retry setting or test timing was relaxed. All 10 local privacy-access
and commercial accessibility browser checks pass across desktop and phone-sized
Chromium for this correction.

Updated local candidate digests after the correction:

- Privacy: `2e00209590818f6afb1081e1b7c0d4b1d88dbdc74256aa38020a848eec872494`
- Android: `e4c928aed5ccc39e10084414a50da3b4d7d02c4047fe0ecbf95096485410c4a4`

These supersede the local candidate digests above without granting readiness
approval. CI checks are bound to the updated PR head; no production changes are
part of this correction.
