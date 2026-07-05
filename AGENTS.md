# SafeBus Alberta Agent Instructions

SafeBus Alberta is a school transportation operations and live bus visibility platform.

It is not a PowerSchool replacement.
It is not a full school management system.

Core product principle:

> Track the bus, not the child.

## Workflow

- Work one milestone at a time.
- Do not implement future milestones early.
- Do not push directly to `main`.
- Use feature branches.
- Open a pull request for review.
- Do not merge without human approval.
- GLM may build.
- Codex reviews.
- Human approves final merge.

## Current Development Setup

- Hosted Supabase DEV is used for smoke testing.
- Do not run Docker commands.
- Do not run `supabase start`.
- Do not run `supabase db reset`.
- Keep SQL migrations in `supabase/migrations`.
- Apply migrations manually to hosted Supabase DEV through SQL Editor.
- Do not modify production.

## Frontend Environment

Frontend may only use:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never expose service role or secret keys in frontend code, `.env`, docs, logs, or screenshots.

## Privacy Rules

- Do not add Alberta Student Number.
- Do not add `asn`.
- Do not add `alberta_student_number`.
- Do not add student home address.
- Do not add student health data.
- Do not expose full student lists to guardians.
- Guardians can only see their linked students.
- Drivers should only see their own or assigned data.
- Do not bypass RLS.
- Do not add public policies.
- Do not add service-role frontend logic.

## Current Architecture

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Supabase Auth
- Supabase Postgres
- Supabase RLS
- Hosted Supabase DEV for smoke testing

## Current Active Migrations

- `0001_auth_profile_foundation.sql`
- `0002_foundation_read_grants.sql`
- `0003_students_guardians_foundation.sql`
- `0004_transportation_structure_foundation.sql`
- `0005_transportation_admin_write_foundation.sql`

Legacy archived migration:

- `supabase/legacy/0004_hosted_schema_alignment.sql`

Do not apply the legacy migration to clean dev/staging/production databases.

## Scope Control

Do not add these unless the milestone explicitly asks:

- live GPS
- maps API
- QR codes
- student badges
- pickup/drop-off scan events
- notifications
- SMS
- trips
- CSV import
- PowerSchool integration
- SchoolEngage integration
- production deployment

## Required Validation

Before final report, run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
