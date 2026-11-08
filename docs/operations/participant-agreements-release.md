# SafeBus participant invitation terms — reviewed implementation boundary

**Status:** Owner approved the proposed driver/guardian Terms of Use wording on November 8, 2026. PR implementation remains under review; no participant migration installed, terms published, customer signature, or commercial activation. This wording approval is not authorization for an automatic Netlify deploy or production release.

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

## Required verification / release order

1. Review the proposed forward migration and run isolated PostgreSQL replay (including role refusal, no implicit consent, immutable receipts and grandfathering), frontend unit tests, browser and mobile builds.
2. Finalize and separately approve the actual mobile Terms of Use content before publishing it.
3. Rehearse and install this one migration using a protected **schema-first** release with a fresh exact-main fingerprint and authorized production backup/recovery evidence; do not replay historical migrations, bypass existing release provenance, or run persistent SQL from this review.
4. Confirm existing profile counts, new-role trigger, private grants, RPC behavior and unchanged existing transport actions.
5. Deploy web/native bundles only after installation and approved participant Terms publication; perform a real signed-session invitation and document-acceptance test with synthetic, isolated identities and no real notifications.
6. Confirm device-local privacy notice is not duplicated after the server receipt, repeated acceptance is idempotent, and a rejected or revoked session cannot fabricate success.
7. Do not claim commercial launch readiness from this implementation or an isolated test.

## Privacy/security limitation for release review

The agreement screen is a user-journey gate. The recorded acceptance is server-authoritative, but the migration does not put a new Terms check into all transportation data RPCs or offline driver ingestion. The reviewer must explicitly decide whether further server-side access enforcement is necessary under the chosen customer contract and release policy; do not misrepresent a UI redirect as an API security boundary. Preserve active-trip offline handling.
