# Production configuration approval checklist

Release SHA: __________ Reviewer: __________ Date: __________

## Production identity and residency

- [ ] The existing `BusSafe` project is recorded as the sole database and production system of record.
- [ ] It was frozen, backed up, and adopted without resetting or replaying migrations.
- [ ] The current manual backup is encrypted, stored outside the repository, and has verified SHA-256 evidence.
- [ ] `FREE_PRELAUNCH_ONLY` is recorded; no commercial uptime or recovery promise is made on the Free tier.
- [ ] Its private `safebus_release.environment_identity` is `production`.
- [ ] Supabase region evidence confirms `ca-central-1`.
- [ ] Material subprocessors and backups are approved for Canadian processing.
- [ ] No production database URL or server secret exists in development, staging, preview, or local configuration.
- [ ] Credentials previously used from developer machines were rotated.
- [ ] Approved QA cleanup is recorded and no `@example.test` identity remains.
- [ ] No server key or database URL appears in frontend settings or build output.

## Review and release

- [ ] `main` protection and required human review are enabled.
- [ ] The commit is immutable, reviewed, and passed every required check.
- [ ] Production preflight is read-only and its attestation matches the exact SHA and project.
- [ ] Migration checksums, drift detection, and generated database types pass.
- [ ] The adopted migration ledger is complete.
- [ ] No migration is pending; schema-changing release is blocked without a separately approved isolated test target.
- [ ] Before commercial launch, automatic backups or an approved equivalent and a recovery exercise are current.
- [ ] An application rollback exercise has approved evidence.

## Application hardening

- [ ] Production output contains no `.map` files.
- [ ] Mobile WebView debugging and mixed content are disabled.
- [ ] Fonts are self-hosted and unexpected third-party requests were reviewed.
- [ ] CSP is tested without violations in supported workflows.
- [ ] HSTS, frame restrictions, MIME-sniffing protection, Referrer Policy, and Permissions Policy are present.
- [ ] TLS, custom domain, redirects, and authentication callbacks are approved.

## Vulnerability acceptance

- [ ] Dependency audit has no critical, high, or exploitable moderate finding.
- [ ] Secret scanning and CodeQL pass.
- [ ] React Router is at the patched approved version.
- [ ] Any accepted finding has Security Lead rationale, owner, and expiry.

Security approval: __________ Privacy approval: __________ Release approval: __________
