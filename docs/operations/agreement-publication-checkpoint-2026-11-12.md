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

## Publication attempt and diagnosed prerequisite — November 11 Alberta time

PR #442 was merged as `c7aef34151ff5fe74d9818e56542203c95ac0ce1`
after all ten PR checks passed. Main CI and security analysis also passed.
Agreement rehearsal run `43139662408` passed validation and all four isolated
agreement database tests, then stopped at `AGREEMENT_UNRELATED_SCHEMA_DRIFT`
before applying agreement SQL or creating recovery evidence.

A read-only catalog inspection established the outstanding tracking installation
described in `commercial-launch-closure-2026-11-11.md`. Applying the committed
`tracking-release-lineage-20261111.json` inverse delta **in memory only** reproduces
the ledger fingerprint `17933029e03585ebec3918cd1c7ac7d53ecfdc994dfbc2db254c57f4a8951592`
exactly. The installed catalog fingerprint is
`65762d75624a2fff757e9ed2328757e62019782327c8ebb2a46b5c35757c3f1b`.
When transporting catalog rows through JSON, preserve the node-postgres representation
of PostgreSQL `name[]` fields (policy roles and enum labels are array-literal strings);
otherwise a comparison can falsely report a different digest.

Protected `tracking_history` rehearsal `43141731488` passed validation but failed
with `42501` during rehearsal. A subsequent read-only ownership check confirmed
`cron.job_run_details` belongs to `supabase_admin`; the deployment role `postgres`
has neither CREATE on `cron` nor owner rights on that table. The proposed index
cannot be installed by this role. No tracking repair was committed.

The agreement runner now recognizes the exact already-installed tracking delta
using the existing inverse-catalog proof and original/latest ledger checks. It
does not install the housekeeping repair or modify any cron object. Unknown
schema, permission or ledger changes still fail. Reconciliation provenance is
retained in encrypted recovery and its metadata; installation rechecks the ledger
inside its transaction and registers the combined verified schema atomically with
the agreement change. Recovery restores the actual pre-agreement fingerprint and
the original ledger discrepancy, rather than claiming housekeeping was fixed.

The release ledger permits one row per source commit. The runner rejects reuse of
an already-registered latest release SHA before rehearsal. The separate tracking
repair is no longer a prerequisite for agreement publication. Its remaining
provider-table ownership problem needs an independent, supported repair.

Focused validation passed 11 tests, including exact tracking reconstruction,
unexpected-grant/schema/later-ledger rejection, agreement order/consent isolation,
recovery and protected-context checks. These local results do not establish a
successful protected rehearsal, installation, app release or published catalog.
