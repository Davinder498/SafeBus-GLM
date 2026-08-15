# Production configuration approval checklist

Release SHA: __________ Reviewer: __________ Date: __________

## Environment and data residency

- [ ] DEV, staging, and production use distinct Supabase projects and Netlify sites.
- [ ] The existing hosted project was frozen, backed up, and adopted without replaying migrations.
- [ ] Each database has a matching `safebus_release.environment_identity` record.
- [ ] DEV/staging contain synthetic data only and destructive jobs reject production identity.
- [ ] Supabase project region evidence confirms approved Canadian processing (`ca-central-1`).
- [ ] All material subprocessors and backups are approved for Canadian processing.
- [ ] Staging contains synthetic data only.
- [ ] Production secrets exist only in the protected production environment.
- [ ] Credentials previously used from DEV machines were rotated at production cutover.
- [ ] Approved QA cleanup is recorded and no `@example.test` identities remain.
- [ ] No service-role key or database URL appears in frontend settings or build output.

## Review and release

- [ ] `main` branch protection and required human review are enabled.
- [ ] The release commit is immutable, reviewed, and passed every required check.
- [ ] The exact 40-character release SHA has a current, matching preflight attestation.
- [ ] Preflight completed before the first persistent database change.
- [ ] Migration checksums, drift detection, and generated database types pass.
- [ ] The database release ledger is complete; a populated untracked database was not auto-initialized.
- [ ] The staging one-click release succeeded for the same commit.
- [ ] A current staging rollback exercise has approved evidence.
- [ ] Database backups/PITR are enabled and a recovery exercise is current.

## Application hardening

- [ ] Production output contains no `.map` files.
- [ ] Mobile release has WebView debugging and mixed content disabled.
- [ ] Fonts are self-hosted and unexpected third-party requests were reviewed.
- [ ] CSP is tested without violations in supported workflows.
- [ ] HSTS, frame restrictions, MIME-sniffing protection, Referrer Policy, and Permissions Policy are present.
- [ ] TLS, custom domain, redirect, and authentication callback settings are approved.

## Vulnerability acceptance

- [ ] Dependency audit has no critical, high, or exploitable moderate finding.
- [ ] Secret scanning and CodeQL pass.
- [ ] React Router is at the patched approved version.
- [ ] Any non-exploitable moderate finding has documented Security Lead rationale, owner, and expiry.

Security approval: __________ Privacy approval: __________ Release approval: __________
