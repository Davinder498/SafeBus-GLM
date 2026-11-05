# Reserved-provider default privileges

Acceptance before implementation: school authority admins, supported scoped
administrators, transportation admins, guardians, drivers and platform admins
retain their existing grants, RLS, session/MFA requirements and authority/own-data
boundaries. Retired school-admin access stays denied. No source event, channel,
recipient choice or provider service is changed. No real notification is QA.

The audit must still reject application-owned unsafe defaults, unknown grants,
client schema creation, privileged role membership, public extension objects and
exposed extension schemas. It must report retained provider defaults explicitly.
This change requires normal human PR review and a protected read-only production
audit before live acceptance. It does not revoke reserved defaults or grant a
role, and is not completion of signed-user or commercial launch acceptance.

## Evidence and supported scope

Fresh BusSafe inspection on PostgreSQL 17.11 confirms the previous application
repair remains installed. The connected `postgres` role is not a superuser and
cannot set or inherit `supabase_admin`. Extensions are outside `public`, and no
public relation or function is owned by `supabase_admin`. No client can create
objects in the checked application schemas. The remaining 25 raw findings belong
only to the provider's reserved creator role.

Supabase's November 4 guidance explains this restriction and recommends keeping
extensions outside the API schema. This platform configuration is already in
place on BusSafe. PostgreSQL applies defaults to the object-creating role, not
roles of which that creator is a member. These facts support a narrowly verified
provider-boundary treatment, rather than pretending the 25 ACL entries vanished.

The source audit will keep its raw default collector unchanged. It may recognize
only the exact observed provider finding set, with exact global/public default
ACLs, a reserved superuser inaccessible to clients and the audit operator, zero
provider/extension public relations or functions, and no public extension.
Every installed extension schema and actual relation/function member schema
must receive a real Data API rejection (406/PGRST106). Bad credentials, outages,
missing metadata, a new grant, changed role attributes or an exposed schema fail.
The other authorization checks remain mandatory and independent.

This is a proposed change to the audit's acceptance rule. Human merge review is
the approval boundary. It is not a managed-role SQL repair, a blanket exception
for Supabase, or authority to bypass production review. No production DDL or
vendor message is needed to prepare and test this source change.

## Primary references

- [Supabase reserved default privileges](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema)
- [PostgreSQL 17 default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)

## Verification and release

Use owned embedded PostgreSQL fixtures for grant, role and extension fault
injection; no hosted fixture writes. Inspect the live catalog only inside bounded
read-only transactions with rollback. After human review/merge, run the existing
protected Authorization audit without altering its production environment.
The runtime grant surface, guardian column restrictions, RLS/session guards and
Data API inventory checks must all pass separately. Preserve a failed check as
a finding; do not expand this treatment to absorb another failure.
