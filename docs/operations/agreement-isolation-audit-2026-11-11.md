# Complete private agreement isolation audit

The post-434 release passed migration checks, drift, schema preflight and canonical
types. Its authorization check rejected the first of eight deliberately private
agreement tables omitted from the older seven-table no-policy inventory.

The November 7 district agreement migration defines agreement_catalog,
agreement_document_versions, agreement_executed_artifacts, agreement_packages and
tenant_agreement_requirement. The November 8 participant agreement migration
adds participant_agreement_acceptances, participant_agreement_requirements and
participant_terms_publication. Their RLS/no-policy design denies direct table
access; authorized security-definer RPCs provide scoped access instead.

A single bounded read-only catalog capture executed all 18 queries from the audit.
All 238 public RPC signatures, 183 authenticated signatures and 218 service
execution signatures match the committed inventory exactly. Every negative
catalog check returned zero findings; the approved session hook exists and the
school-location guard exists. The only inventory mismatch was these eight tables.
All 15 private tables have postgres ownership, RLS enabled, zero policies and no
anon/authenticated/service-role table privileges. Metadata-only evidence is in
config/observed/private-agreement-isolation-20261111.json.

Recognize only the eight exact reviewed names in addition to the existing seven.
The checker retains all isolation requirements and rejects unknown names. Tests
exercise each isolation mutation against every recognized table. Do not add
permissive policies or grants merely to satisfy a session-policy audit.

No database changes, fingerprint resets, migration rewrites or new execution
grants are included. Full protected Data API discovery and hidden-schema probes
remain required; the connector catalog capture does not substitute for those
HTTP checks. Validate the complete protected preflight before publication.

Validation: all 1,824 tests passed (1,213 web, 32 mobile, 579 release),
plus 27 focused checks. Typecheck, lint, root production builds, explicit mobile
build and Android cap:sync all passed. Generated brand-image churn was restored.
Browser CI and protected HTTP checks are separate remaining validations.
