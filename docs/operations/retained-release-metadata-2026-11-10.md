# Retained notification recovery metadata preflight

Release run `42912332944` passed exact-main CI selection, then stopped in
`migrations:drift` with `Observed release metadata inventory differs.` The build
and publish steps did not run. The 125 immutable migration files still verify.

A read-only inspection of BusSafe found the six registered release tables plus
`safebus_release.pickup_dropoff_event_copies`. The reviewed unified-notification
migration `20261029000139_unified_notification_delivery.sql` moved that obsolete
snapshot table into the release schema as restricted recovery evidence. The
specialized district-agreement workflow already recognizes this table. The
shared observed-baseline preflight still required the earlier inventory.

The shared check now recognizes only that exact optional ordinary table, with
its seven original non-null UUID/text columns, postgres ownership and RLS.
Public/table/column grants, client or service-role access, policies and custom
triggers are rejected. Unknown release objects still fail. This does not drop
retained records, replay migrations, register historical executions, rewrite the
observed contract, or update the latest deployed schema fingerprint. Baseline
identity, provenance, checksums, dispositions and full application/authorization
fingerprint checks remain mandatory.

Regression coverage accepts both the original inventory and the retained table,
and rejects unknown objects, disabled RLS, PUBLIC/anon/authenticated/service-role
access, column grants, policies, shape changes, ledger changes and application
schema drift. PostgreSQL fixtures run locally, never against production.

The current latest deployed release is `ba80cbe5671d41dc09671828cf6a0b132d526b88`,
with recorded fingerprint
`17933029e03585ebec3918cd1c7ac7d53ecfdc994dfbc2db254c57f4a8951592`.
An independent read-only catalog capture through the Supabase connector produced
`6f8d0fbb4c03316d471cdf1201c968540977fb032712bb906d3e976372cbba6a`.
This is not a protected direct-connection preflight result and does not authorize
accepting a new fingerprint. After human review/merge and successful main CI,
run the protected publisher against the new exact main SHA. If its direct
fingerprint check also fails, reconcile the catalog change against reviewed
operational release evidence before another deployment. Do not stamp the current
schema as deployed merely to clear the gate.

The background invalidation queue remains a separate protected operational
release. Passing this metadata check does not install it or qualify 10,000-bus
capacity. Human merge and production environment reviews remain required.

Validation: 12 focused PostgreSQL regression tests passed; immutable migration
verification, typecheck, lint and the root build passed (Turbo cache hits).
The full test command did not produce a completion summary, and the explicit
mobile build/sync did not run: automatic approval review stopped command
continuation after flagging possible third-party build telemetry. Do not treat
these remaining validations as passed; repository CI must complete them.
