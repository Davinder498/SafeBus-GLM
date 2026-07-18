# Tenant Admin Student CSV Import — Manual Acceptance

Use hosted Supabase DEV only. Do not run these steps against production.

## Prerequisites

1. Apply migrations through `0044_tenant_admin_student_csv_import.sql` in the
   hosted Supabase DEV SQL Editor.
2. Sign in as an active tenant administrator whose tenant has at least one
   active school.
3. Keep a transportation-admin account available for the role-denial check.

## Happy Path

1. Open **Students** and confirm **Import CSV** appears beside **Add student**.
2. Download the template and confirm its header is:
   `first_name,last_name,preferred_name,grade,school_name`.
3. Add two students. Use an existing school name with different letter casing
   for one row and leave `school_name` blank for the other.
4. Select the file and confirm both rows appear in the preview without errors.
5. Import the file and confirm the success count, roster reload, active status,
   matched school, and school-less student.

## Validation and Atomicity

1. Select a file with an unknown column and confirm import remains disabled.
2. Select a file with a missing first or last name and confirm the row error.
3. Select a file with a nonexistent school and confirm no rows can be imported.
4. Select a file with one valid row and one invalid row, attempt import, and
   confirm neither student is created.
5. Select the successful file again. Confirm possible-duplicate warnings appear,
   import remains disabled until acknowledgement, and the UI explains that
   every row creates a new student.
6. Confirm a 5,001-row file is rejected and a file over 5 MB is rejected.

## Authorization and Privacy

1. Sign in as a transportation administrator and confirm **Import CSV** is not
   shown.
2. Run `pnpm test:rls:dev -- tests/rls/student-csv-import-rls.sql` only with the
   guarded hosted-DEV environment variables.
3. Confirm browser network requests send only normalized student import rows to
   `admin_process_student_csv_import`; no file is uploaded to storage and no
   service-role credential is present.

## Required Repository Validation

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```
