# SafeBus — Server-side generic Firebase push payload release

**Date:** 2026-11-08 (Alberta)  
**Status:** Reviewed source candidate only; **not yet deployed to Supabase**. Production distribution and field acceptance still require separate human-controlled steps.  
**PR:** Separate from business/vendor documentation PR #411.

## Problem and verified behavior

Current production PostgreSQL notification copy can include a student's full name and the assigned bus number for pickup/drop-off notices. The FCM resolver obtains this detailed copy, and the dispatcher's `buildFcmMessage` previously forwarded the same `title`/`body` to Google's Firebase service. `preview_mode='generic'` is a stored preference but was not used to redact the outbound text. Android `visibility=PRIVATE` affects device display, not third-party transport. The detailed copy belongs only in the tenant/role-authorized in-app inbox.

## Approved change (user approved November 8, 2026)

- Change the server-side FCM HTTP v1 **notification text only**: use a fixed, event-type-only title (for example, **Pickup recorded**) and the fixed body **Open SafeBus to view details.** No names, route/bus/stop labels, contact details, coordinates or user-entered announcement content are copied into the FCM notification title/body.
- Do not trust `row.title`, `row.body`, `preview_mode`, device OS privacy mode, or an installed app's version to enforce this restriction. Both new and old Android builds receive safe provider-visible text after the server-side dispatcher is deployed.
- Preserve the existing delivery authorization/eligibility, FCM token, notification ID, event type/category, destination routing, private Android visibility, urgent alert channel and priority, retry/idempotency behavior, and **full authorized in-app notification copy**.
- Keep the email pathway **unchanged** in this PR. Resend email content (which can include full student name and bus number) remains an independent privacy/business decision requiring actual district authorization and supplier terms assessment.
- Do not change production SQL, notification preferences, recipients, message history, app UI, Android binaries, Geoapify, Stripe, or other supplier configuration in this code PR.

## Verification gates

1. CI tests: hostile/Unicode student names, route/stop/coordinate labels and user-provided announcements must not appear in `buildFcmMessage` notification text, regardless of `preview_mode`; unknown/prototype event names fall back to **SafeBus update**.
2. Integration tests: Supabase-generated detailed copy stays in the in-app/in-DB record and email template as before, but actual FCM HTTP v1 JSON contains only approved generic notification text; FCM routing fields, priority, retry and device behavior stay functional.
3. Complete source reviews and CI. Do not assume a main-branch merge deploys a Supabase Edge Function. Publish the reviewed dispatcher via existing protected, authenticated production release procedure only, without bypassing deployment approvals.
4. Verify the deployed function's source hash and a controlled authorized delivery without actual student names, then confirm no residual detailed notification text crosses the provider boundary. Review previously transmitted data and vendor retention separately with the Privacy Lead. Device field acceptance remains deferred and should not be marked passed.
5. After verified deployment, revise the supplier evidence and draft Play disclosure with actual observed results. Do not mark privacy/Android/pilot readiness approved based solely on a passing source test or this change.
