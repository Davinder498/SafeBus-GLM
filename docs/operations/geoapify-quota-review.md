# Geoapify project-wide quota review — operator procedure

**Status:** Manual calculator and notification templates prepared; *automatic*
70% / 90% alerts **NOT CONFIGURED OR VERIFIED**. Map/operations readiness
remains `not_approved`. Physical Android tests and leaked-password protection
are separately deferred by the owner.

## Verified provider behavior (November 6, 2026)

The Geoapify MyProjects Statistics page gives project usage in request and
credit units. API keys inside the same project share one plan and credit quota.
Map tiles are currently 0.25 credits per tile. The Free plan currently advertises
3,000 credits per day, but a different project plan may have a different limit.

Official guidance:
- https://myprojects.geoapify.com/help/
- https://myprojects.geoapify.com/help/api-keys/
- https://www.geoapify.com/pricing/
- https://www.geoapify.com/pricing-details/

Do not invent a private statistics endpoint or query a management API with the
browser's map key. This repository contains **no validated automatic usage
retrieval**, and merely reading successful map configuration is not quota
monitoring.

## Safe operator review

1. Sign into the correct SafeBus Geoapify project and select Statistics.
   Confirm the **total project credits**, all API keys, current daily quota,
   applicable usage date and plan. Do not extrapolate from map tiles alone.
2. Independently transcribe only the following non-secret totals to a local
   temporary JSON file, **outside the repository**, with no key, project ID,
   user, IP, customer or location values:

   ```json
   {
     "source": "geoapify-project-statistics",
     "scope": "project-total",
     "usageDate": "2026-11-06",
     "usedCredits": 0,
     "limitCredits": 3000
   }
   ```

   Values shown are illustrative, not actual SafeBus usage. The tool rejects
   extra fields and stale dates, and it does not prove your transcription is
   correct. Store verification/screenshots only in approved restricted evidence.
3. From the repository root execute:
   ```powershell
   node scripts/review-geoapify-quota.mjs "C:\\approved-evidence\\geoapify-quota.json"
   ```
   Exit 0 is below 70%; exit 2 means 70%/90% threshold reached; exit 1 means
   missing/invalid/stale input. The output explicitly says
   `alertSent:false`, `automatedMonitoringEnabled:false` and
   `operator_supplied_unverified` to prevent a false rollout claim.
4. Confirm 70% and 90% alarms are actually supported by an authorized provider
   setting or a newly reviewed integration using authenticated project-wide
   statistics. Two end-to-end alert delivery drills must reach
   `info@safebus.kids`. The existing fixed Resend templates are **prepared
   but not automatically triggered** by this local reviewer.
5. Verify current key restriction scope, current plan, support agreements,
   estimated pilot request capacity and incident fallback. Never log or paste
   a Geoapify API key, and do not commit vendor console screenshots.

## Current example thresholds (Free plan only)

| Condition | Project total credits | Tile equivalent if no other APIs |
| --- | ---: | ---: |
| 70% warning | 2,100 / 3,000 | 8,400 tiles |
| 90% critical | 2,700 / 3,000 | 10,800 tiles |

These are *calculations*, not a real observed utilization or configured alert.
A future verified integration must use live project-wide credit usage and
current actual quota, not static free-plan assumptions. No production service
settings, map key, billing, subscription, alert recipients or readiness approvals
are changed by this documentation/tooling work.
