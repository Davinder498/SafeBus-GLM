# Alberta authority reference directory

The directory is organizational reference data. Selecting a record does not
create an account, invite anyone, import schools, or change an existing authority.
Platform administrators search by name, code, or city and separately choose the
first school authority admin. They review a support contact and address before
sending the invitation. School authority admins can later edit their published
support information. Directory refreshes never update accounts or support contacts.

## Common-name search correction — 2026-10-25

A production read-only audit found all 445 source records installed and matching
a freshly downloaded provincial workbook after the documented website omissions.
The ordered field fingerprint matches for all 13 imported fields, including the
source date and availability. Evidence is retained in
`docs/qa/authority-directory-search-audit-2026-10-25.json`. This establishes import
consistency, not independent accuracy of every published phone number or email.

The audit also reproduced a search defect: code 3030 exists as **The Calgary
School Division**, while searches for **Calgary Board of Education** or **CBE**
have no name match. Alphabetical ordering of all Calgary-city matches also puts
that authority outside the first 20 results. Code **3030** and **Calgary School
Division** remain available searches on the observed live version.

The forward correction adds a private `search_aliases` column and six explicitly
verified aliases for four authorities. Provenance is in
`config/authority-directory-search-aliases.json`, with each authority's own website
and review date. These aliases supplement provincial names; they do not rename
customer accounts or establish exhaustive coverage of every common name.

Search normalizes punctuation/spacing, matches all query tokens, and orders exact
code/name/alias and name-prefix matches ahead of city-only matches before applying
the page limit. Results and selected records show common names alongside the
unchanged provincial source name. The RPC signature, platform role/session/MFA
checks, private-table access restrictions, and availability rules remain intact.

Monthly source imports explicitly write only the 13 provincial fields. They
preserve curated aliases, even if a baseline includes that column. Add or revise
aliases only through a reviewed forward change backed by an authority's own
publication; do not invent acronyms or infer them from names.

`20261025183313_authority_directory_search_aliases.sql` remains prepared/unapplied.
Its embedded PostgreSQL tests rehearse and roll back the new column and search
replacement, then cover CBE, common names, reordered tokens, punctuation, result
ordering, withdrawn records, permissions, and preservation through a full refresh.
The live observation above does not claim that this correction is live. Use the
existing protected review, recovery, rehearsal and release process before rollout.

## Complete city search results — 2026-10-25

A further production read-only count found 110 available reference records whose
organizational city is Calgary and 77 whose city is Edmonton. The old search
returned at most 20 with no total or continuation control, explaining why city
results appeared to stop around B. These are organizational address cities, not
a guarantee that an authority serves only that city. Name and alias matches can
also appear in a city query.

`20261025185119_authority_directory_search_pages.sql` adds the platform-only
`search_authority_reference_directory_v2(text,integer)` RPC with the same matching,
ranking, availability, active-session and MFA checks. Each response contains at
most 20 items, the total number of matches, and a nullable next offset. Ordering
is deterministic, with authority code as the final tie-breaker. The old RPC keeps
its array response and delegates to the first page. No existing API signature
changes. The client shows the count and a **Load more** button, preserves loaded
results on a retryable later-page error, and discards responses for an old query.

Release this pending migration after the aliases correction and before its client.
Embedded PostgreSQL verifies every Calgary/Edmonton match across all pages,
totals, invalid offsets, authorization, legacy compatibility and rollback of
the new function and replacement wrapper. Browser checks use local mocked
requests; no invitation or notification is sent. Neither pending correction has
been applied by this work; the hosted read-only count is separate live evidence.

On a constrained local workstation, set `VITEST_MAX_FORKS=1` and
`VITEST_MIN_FORKS=1` before `pnpm test`. The web test task explicitly passes these
worker settings through Turbo. Unset CI defaults and all test timeouts are
unchanged. Run the browser suite separately from the embedded PostgreSQL suite
to avoid resource contention during database initialization.

## Initial source review

The [official catalogue](https://open.alberta.ca/opendata/alberta-education-schools-and-authorities)
identifies the [authority workbook](https://education.alberta.ca/media/1626668/authority.xlsx)
and monthly maintenance cadence. Downloaded 2026-10-25; Extract Date is 2026-10-24.
The workbook contains 445 unique four-character authority codes, including leading
zeroes. Categories are Public (42), Separate (17), Francophone (4), Charter (36),
Private School (170), ECS Private Operator (91), Federal First Nations (34), and
Provincial (51). This establishes coverage of this source snapshot, not independent
proof that every currently operating Alberta authority is listed.

Mapped columns: Authority Code, Authority Name, Authority Type, Authority Address1,
Authority Address2, Authority City, Authority Province, Authority Postal Code,
Authority Telephone, Authority E-Mail, Authority Website, and Extract Date. These
are organization columns. Fax, blank columns, and any unmapped fields are excluded.
No individual contact directory or administrator identities are imported.

Fifteen records have no address or province. Missing values remain missing.
Three invalid website values (codes 0108, 9309, 9413) are omitted and explicitly
reported; protocols are not guessed. HTTP websites remain in reference data but
are not prefilled into the existing HTTPS-only published support website field.
Missing support details require ordinary manual completion during onboarding.

Source SHA256, category counts, omission report and dry-run changes are retained in
`docs/qa/authority-directory-source-review-2026-10-25.json`. The unmodified source
is retained in `tests/fixtures/authority-directory/authority-2026-10-24.xlsx` so the
parser and initial import remain reproducible.

The [Open Government Licence – Alberta](https://open.alberta.ca/licence), version
2.2, was inspected on 2026-10-25. It permits commercial use with attribution and
excludes personal information and other specified rights. The dataset metadata
identifies this licence. Required attribution appears in search and import files:

Contains information licensed under the Open Government Licence – Alberta.

No government endorsement is claimed. Public organizational contacts are not
evidence that a person is authorized to administer SafeBus or provide transportation
support. Those choices remain explicit.

## Monthly operator procedure

1. Download the authority workbook from the official URL above. Retain its original
   bytes and check that the catalogue and licence still apply. Do not scrape staff
   names or substitute the province-wide schools workbook.
2. Export the current directory using
   `scripts/sql/authority-directory-readonly-baseline.sql`, saving its single JSON
   value as `current-directory.json`. The script uses a read-only transaction,
   local timeouts, and final rollback. Keep the production designation.
3. Prepare an offline comparison:

   ```sh
   node scripts/prepare-authority-directory.mjs --input authority.xlsx --baseline current-directory.json --out .codex-artifacts/authority-directory-review
   ```

   This command never connects to a database and has no apply mode. It writes a
   change report, the proposed baseline JSON, and `reviewed-import.sql`. For the
   initial empty directory only, use `--initial` instead of `--baseline`.

4. Review additions, changed codes, missing records, source date, count, and
   omitted invalid fields. A missing record becomes unavailable for new selection;
   it is retained for existing account references. Do not automatically accept
   a surprising drop in coverage. Preserve the report and source digest.
5. Generate a new pending migration with the Supabase CLI and put the reviewed
   SQL there. Open a PR. Promotion and application use the existing protected
   production adoption/release workflow with human review, verified recovery
   evidence, reconciliation, and bounded rollback rehearsal. Never run the SQL
   directly against BusSafe from a workstation or replay the migration chain.
6. Refresh the read-only baseline afterward and retain its source digest with
   release evidence. An import with a stale baseline fails before updating rows.
   Source refresh and invitation finalization serialize on the selected reference
   row; a unique account association remains the final duplicate guard.

## Interfaces and compatibility

- New RPCs are listed in `config/pending/authority-directory-authorization.json`.
  Anonymous callers, service-role callers, and non-platform users cannot search.
  Reference tables have RLS, no client table grants, and no public policies.
- `createTenant` version 2 preflights the confirmed support contact and optional
  authority code before the email provider call. A schema/configuration failure is
  explicit and sends no invitation. The versioned finalizer repeats authorization
  and duplicate checks and atomically saves the account association and support.
  The existing finalizer and its trigger-based onboarding defaults are unchanged.
- Legacy onboarding payloads retain their existing path. Existing support writer
  signatures remain valid and preserve addresses they do not supply. Version 2
  can explicitly clear an address. The corrected legacy authority email validator
  uses a literal dot instead of the hosted overescaped expression; authorization,
  MFA, recent authentication, scope, and audit requirements remain.
- Address-aware reads delegate the existing support contact chain and attach only
  the caller's authority address. Platform fallback contacts remain intact.
- Provider acceptance and database finalization cannot form one external
  transaction. Existing provider failure/recovery handling is preserved. A final
  persistence failure is reported; successful provider acceptance is not proof of
  activation or completed onboarding.

## Protected rollout and recovery

The read-only hosted schema snapshot is retained in
`docs/qa/authority-directory-hosted-schema-2026-10-25.json`. It records existing
function definitions/digests, columns, and tenant triggers. No hosted records were
changed. Recheck this baseline before an approved rollout.

Both new migrations remain in `supabase/migrations/pending`. The active checksum
chain, installation tip, and production release protections are unchanged. Review
canonical promotion order with the other prepared migrations; apply directory
schema, then the reviewed source import, before deploying the new clients.
Install the owner-approved launch-ready notification defaults through their
existing reviewed rollout as well; this feature does not replace that work.

Embedded PostgreSQL rehearses the real prepared schema and initial data in a
transaction, checks all 445 rows, rolls back, and verifies the new table is absent
and existing accounts preserved. This is local recovery evidence, not a production
backup or hosted rehearsal. Current verified recovery evidence, a hosted bounded
rollback rehearsal, human merge review, and protected approval are still required
before persistent installation. Do not invent completed backup evidence or weaken
the existing installation guard to make this release pass.

If a released UI must be rolled back, restore its previous reviewed artifact.
The additive database objects can remain while the approved recovery plan is
reviewed. Do not drop reference rows or account associations after accounts have
been onboarded with them. Reversing a data refresh requires a reviewed patch from
the retained prior baseline, guarded against the current import digest.

No live invitation, announcement, push, billing transaction, destructive fixture,
or production deployment is part of local verification.
