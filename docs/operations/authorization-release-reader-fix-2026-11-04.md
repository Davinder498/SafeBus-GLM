# Authorization release reader correction

Protected release 41883513949 stopped during rollback-only rehearsal before
recovery capture or persistent installation. The live read-only check afterward
confirmed zero of the ten proposed session guards was installed.

`pg_policies.roles` has PostgreSQL type `name[]`. The release's `pg` driver returns
that type as the string `{authenticated}`, while the reviewed JSON and PGlite
test reader represent it as `['authenticated']`. The before-state has null roles
for the missing policies, so it passed; the after-state failed strict comparison.

The query now casts that metadata column to `text[]`, which `pg` decodes as a
list. A regression test uses the real driver's type parser and PostgreSQL result
type metadata, so removing the cast reproduces the failed comparison. Failure
logs also identify the comparison phase and section without printing catalog
contents, user records or secrets. Real mismatches still stop the release.

Practical impact for school authority admins, school-scoped admins,
transportation admins, guardians, drivers and platform admins: no screen,
navigation, billing, bus-operation, role, MFA or notification rule changes. This
corrects how the release checker reads permission metadata. Both pending
migrations, their approved scope and all recovery/production review gates remain.
Passing this source fix is not proof of persistent installation or completion of
the separate Supabase-managed default-privilege repair.
