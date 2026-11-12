# Agreement publication checkpoint — November 12, 2026

This checkpoint distinguishes the production state from the proposed PR #442 changes.

## Verified production state

A bounded read-only production query (statement timeout five seconds, lock timeout
one second, final rollback) confirmed:

- Zero published school-authority catalogs, zero packages, zero executed artifacts.
- `prepare_my_district_agreement_order(uuid,jsonb)` is not installed.
- Existing `manage_disposal` exports enforce active sessions, authority scope and
  record ownership. Platform administrators are aggregate-only; their role does
  not permit exporting a customer's records. MFA/recent-sign-in checks remain in
  the existing authority helper. Source exports remove specified credential fields.

An initial aggregate query used an incorrect plural catalog name and failed
without changes. Catalog inspection established the actual names; the corrected
query above succeeded. No customer records or actual exports were read.

## Completed implementation in the PR

- Customer-specific order snapshots, preserved accepted versions and both archive
  destinations, with PDF and exact UTF-8 downloads.
- Scoped assisted-return operator tool and runbook, using files downloaded through the existing authorized
  export endpoint; checks per-file hashes, scope, tenant identity, retained
  exceptions and attributable delivery evidence. Does not create unrestricted
  platform access, a deletion operation or an automatic transfer channel.
- Netlify supplied-DPA/certificate evidence and actual function-processing scope;
  missing plan-specific expiry is a follow-up, not a blanket code-release blocker.
- One support calendar for all issues: Monday–Saturday 06:00–18:00 America/Edmonton.

## Required order of remaining production work

1. Review and merge PR #442. The owner reserved this merge; do not silently treat
   another implementation instruction as having performed their review.
2. Run the existing protected `Release agreement order snapshots` rehearsal for
   the current main SHA; inspect exact-state, install/restore and recovery evidence.
   Complete its protected install only with the required successful evidence.
3. Run the existing protected application artifact workflow for the same reviewed
   release lineage; verify uploaded files and live behavior. Do not trigger an
   unnecessary Netlify source build or pay for a plan upgrade.
4. Finalize customer-facing document bodies separately from internal review notes.
   The draft pack still contains historical commentary, template placeholders and
   unresolved supplier-country/account fields. Do not paste those drafts into the
   publisher or substitute unsupported claims just to obtain eight documents.
5. Publish the seven common document versions and Order Form template as one exact
   eight-document catalog. Check exact text/digests and availability. Never accept
   the customer agreement on behalf of a school authority.
6. Verify the signed-in customer journey with an explicitly authorized test scope,
   preserving real accounts and without creating charges or sending unsolicited
   invitations. Customer-specific secure return delivery remains verified per case.

No current catalog exists: agreement onboarding is not yet active for new
customers. Passing PR tests or writing this checkpoint does not change that fact.
The unavailable Netlify retention summary alone does not justify stopping steps
1–3; truthful final supplier disclosures and actual customer requirements still
matter for steps 4–5. No readiness flag is changed by this checkpoint.
