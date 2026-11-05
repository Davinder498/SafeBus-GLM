# OpenAPI discovery and execution authorization

Acceptance before implementation: school authority admins, supported scoped
admins, transportation admins, guardians, drivers and platform admins retain
their existing grants, RLS/session/MFA and data boundaries. Retired school-admin
access remains denied. No event, channel, recipient choice, API setting or
runtime function changes. Do not send notifications or invoke business mutations
as QA.

Protected audit run 41962958840 on main `5f3f9843837f3df53e8ee685261bae22c2d7269a`
passed the reserved-default and catalog execution checks, then failed at the
advertised RPC comparison. Its OpenAPI document included all 18 reviewed names
with explicit service-role denials. The audit incorrectly projected the
service-executable set into its discovery expectation. Fresh read-only checks
also confirm the tracking queue and trip replay functions remain denied to the
service role. No in-database OpenAPI-mode setting was returned; the effective
provider mode/request identity is not inferred from that absence.

Compare the secret-key OpenAPI discovery document to the complete reviewed
public RPC inventory. Keep authenticated and service execution comparisons
against actual catalog privileges unchanged, including all explicit denials.
Unknown or missing advertised RPCs must still fail. Overload names can appear
once in OpenAPI, while every signature retains its separate catalog check.

This repairs a source audit contract, not database authorization. Do not grant
service execution to make metadata and privileges look alike. Human merge review
and another protected live audit are required before reporting full acceptance.
Local tests use owned PostgreSQL fixtures and synthetic OpenAPI metadata.

[PostgREST documents](https://docs.postgrest.org/en/stable/references/configuration.html#openapi-mode)
that OpenAPI output can follow or ignore privileges. BusSafe's observed root
document is discovery evidence; it does not establish permission to invoke an RPC.
Supabase also [documents the root schema endpoint](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)
as returning the exposed schema specification with server-side keys.
