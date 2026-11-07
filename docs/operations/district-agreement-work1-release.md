# Work 1 — production SafeBus agreement database release

**Status: implementation prepared, not yet installed.** Use only the existing BusSafe Supabase project `ckrkfylsyihwouvesypm` and production Netlify. No separate staging project, no customer data copies, no agreements published, no Stripe charges.

## Locked deployment decisions
- Three existing school authorities are grandfathered. Do not require retroactive contract acceptance or alter their transportation access.
- New school authorities can be provisioned/invited, but billing and transportation writes must remain blocked until the final agreement is published in Work 2 and the district administrator explicitly accepts it.
- Zero planned downtime: short database lock timeouts; stop rather than force locks.
- Database first; verify tables, RPC grants and preserved operations before any Netlify release.
- Rehearsal is **read-only** against production. Synthetic district acceptance and denied cross-tenant reads are covered by the isolated PGlite release test. A full hosted end-to-end onboarding belongs to Work 3.
- Owner authorization for the install stage is separate from authorization to rehearse.

## Current production observation (2026-11-07)
- Three active district tenants and three active district-admin profiles.
- Migration's 35 targeted public transportation tables exist with `tenant_id`.
- `safebus_private.agreement_packages`, catalog and agreement RPCs were absent before the new migration.
- Observed production baseline and environment identity exist.
- The last documented owner-verified full recovery is from October 15. That historical receipt cannot establish a current pre-change recovery checkpoint.

## November 7 read-only rehearsal repair
The first protected rehearsal stopped at the baseline check. This was expected from a
stale general-purpose baseline: the source contract records the observed October 15
schema, but the previously reviewed unified notification migration moved
`pickup_dropoff_event_copies` to the private `safebus_release` schema afterward.
The general release preflight's inventory is therefore not suitable for this
narrow, independently reviewed agreement release.

The dedicated runner now validates the original immutable observed registration,
the exact three executed security migration checksum records, the actual
security installation and provider DDL-hook provenance, and the **exact** known
seven-object release schema with private RLS and no client grants on the
retained copy table. It does not edit or reclassify the October baseline.

The read-only rehearsal records a SHA256 fingerprint of the **current** observed
application schema. Installation retrieves the immutable successful rehearsal
artifact and compares that fingerprint with a fresh pre-install read-only
observation and again inside the migration transaction. Any unexplained drift
between rehearsal and installation fails closed. The new post-install fingerprint
is registered transactionally, so the general release ledger remains consistent.

The October baseline fingerprint is historical provenance, not evidence that
later operational changes did not occur. This workflow does not claim to have
independently audited every intervening operational migration. It only authorizes
the specifically reviewed agreement migration against a fingerprinted live source.

**The first failed rehearsal is not reusable.** The amended workflow requires
a new main SHA, so the earlier encrypted backup also must be recaptured against
that exact SHA before installation.

## Protected actions after merge to main
1. In GitHub Actions, run **Capture encrypted platform recovery export**, using the *exact current main SHA* and confirmation `BACKUP_PLATFORM_RECOVERY_ENCRYPTED`. Inspect its encrypted artifact, verify its availability and secure offsite copy, and check restoration/recovery capability before attesting. A successful export alone does not prove recoverability. This action and its human approval are separate from installation.
2. Run **Release district agreement database**, mode `rehearse`, same current main SHA, confirmation `REHEARSE_DISTRICT_AGREEMENTS`. The runner verifies the registered production project and baseline in a read-only transaction; it does not execute migration SQL against production. CI also runs the isolated synthetic district replay. Preserve the successful rehearsal run ID.
3. Inspect the actual release evidence. If backup/recovery evidence is not current, the production baseline differs, or the rehearsal fails, **stop**. Do not attempt installation or change an approval status.
4. Only after the owner explicitly authorizes installation, run **Release district agreement database**, mode `install`, confirmation `INSTALL_DISTRICT_AGREEMENTS`. Supply the successful recent encrypted backup run ID, successful recent **rehearse** run ID, and `RESTORE_VERIFIED_OFFSITE` only when the backup has actually been reviewed as recoverable and offsite. GitHub enforces the production environment approval and exact main SHA. Evidence must be from the same reviewed commit and no more than 24 hours old.
5. The install runs a short-timeout transaction containing only the pending agreement SQL. Before commit it verifies all 35 new-tenant write gates, five private RLS tables, function execution privileges and unmodified historical tenant counts. After commit it performs a new read-only verification. On failure **before commit**, the database rolls back. If the result after commit is uncertain, inspect live read-only state rather than replaying SQL.
6. Verify from Netlify and Supabase that the existing three school authorities remain unaffected and that the agreement RPCs resolve, with no published catalog. Do **not** publish Work 2 draft contracts to production. The application deployment must remain behind the verified schema checkpoint; use the protected application release process once its own gates pass.

The protected workflow deliberately does not alter commercial pilot, privacy, maps or operations approval files. This release installs the agreement database only; it is not itself a commercial launch approval or a customer contract.
