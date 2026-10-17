# Tenant downloads and stable QR reprints

This milestone follows the merged optional-seat milestone. Customer choices:
CSV exports include all filtered records across pages; QR support includes
individual PNGs and bulk printable sheets; printing must reuse the same issued QR.

## CSV downloads

The student, guardian, driver and bus directory pages expose **Download CSV** to
active tenant administrators. Downloads use the existing authenticated list RPCs,
with their current tenant/session/RLS restrictions, 100 records at a time. The
current search, status and school filters are captured when the download begins.
Pending debounced search changes disable the action until the list is current.

The browser verifies the authenticated user and current active tenant-admin
profile before and after collection. Every row must belong to that tenant. Count
changes, duplicate IDs, incomplete pages, authorization failures or cancellation
stop the export without downloading a partial file. Navigation, identity, tenant,
role and filter changes cancel in-progress work. These are paginated live reads,
not a transaction snapshot: concurrent edits which do not change counts or cause
duplicate IDs may still appear. Large exports require narrowing the filters to
at most 100,000 records; nothing is silently truncated.

CSV columns are deliberately selected rather than serializing database rows:

| Records   | Included fields                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Students  | Names, preferred name, grade, school, status, the directory-selected roster bus/route/direction/seat, pickup and drop-off labels |
| Guardians | Names, email, phone, status, active student-link count                                                                           |
| Drivers   | Available structured/full name, email, phone, employee number, licence class/expiry, status                                      |
| Buses     | Bus number, internal fleet number, plate, capacity, school, status                                                               |

The student roster selects one current service per student; its exported seat is
looked up by that exact assignment ID. This file is not a complete directional
assignment history or a legal access-request package. Internal IDs, secrets,
credential hashes, raw QR tokens, notes, driver addresses and licence numbers
are not CSV columns. Guardians and drivers have no directory export controls.
No new table grants or RLS policies are added for CSV.

Files use UTF-8 BOM, quoted fields and CRLF lines. Formula-like text is escaped,
including values beginning with whitespace followed by spreadsheet operators.
Empty results produce a header-only file. Files are generated in browser memory,
and temporary object URLs are revoked after the download begins.

## Stable QR printing

**View / download existing QR** loads the active credential without issuing or
replacing it. Student and bus panels offer PNG download and printing. Deliberate
replacement/revocation remains a separate confirmed action for operational
administrators; it is never used as a download fallback.

The prepared migration preserves both existing issuer signatures and delegates
all original authorization, locking and revocation behavior to their private
implementations. Successful issuance also saves the original token encrypted
with pgcrypto AES-256 in private tables. The encryption key is generated once and
kept in [Supabase Vault](https://supabase.com/docs/guides/database/vault). No key is
added to frontend environment variables, source, browser storage or logs. Table
access and internal helper execution are revoked from public, anonymous,
authenticated and service roles. Exposed RPCs explicitly authorize the caller.

The new `admin_get_printable_qr` RPC validates the current tenant, operational
role, student-school scope or bus-school scope, and entity eligibility. It locks
the entity and active credential in the same order as issuance. It returns only
that active credential, verifies decrypted tokens against the scanner hash, and
can explicitly issue a missing code. It never rotates. Revocation removes its
encrypted copy; credential deletion cascades to the private print table.

Legacy codes with only hashes cannot be reconstructed. They remain valid and
are reported as needing an original. The administrator can choose a saved image
or clear photo on that student's/bus's detail page. The image is decoded locally;
only the token is submitted for authenticated verification. A matching active
hash permits saving an encrypted copy of that same token and ID. Wrong images
cannot change a credential. If no original exists, the old code stays valid but
cannot be reprinted; this milestone does not silently replace it.

## Bulk sheets

The student and bus directories expose **Prepare QR sheets** for tenant admins.
The confirmation explains that missing codes will be issued and existing codes
reused. A batch covers all filtered records, up to 200, and processes sequentially
to bound issuance work. Inactive students and retired buses are skipped. Legacy
codes needing originals are identified with links to their records; ready codes
can be printed, and the skipped count is explicit. A cancelled/failed batch
retains any already-issued codes securely so retrying reuses them.

Preview images remain in memory until dismissed, navigation or context change.
Printing uses a separate print-only root, twelve QR cards per A4 page, with a
short student label or public bus number. It hides the administrative interface.
The browser print dialog can also save the sheets to PDF. No QR image is uploaded
to public storage, cached in localStorage, or embedded in CSV files.

## Validation and protected release

- Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` and
  `pnpm migrations:verify`.
- Unit tests cover formula escaping, CSV field selection, all-page collection,
  identity/tenant changes, errors and cancellation, original recovery, stable
  reprinting and bulk skips. Browser tests cover all four real file downloads,
  filtering beyond one page, stable batch preparation and print layout.
- Embedded PostgreSQL tests execute the actual migration/issuer functions and
  real pgcrypto. A synthetic Vault adapter is used because Vault is hosted-only.
  Tests verify ciphertext, unchanged IDs/tokens/hashes, wrong-original rejection,
  role/tenant/session denial, revocation cleanup and atomic failure if the key is
  unavailable. They do not exercise hosted Vault's implementation or access any
  hosted project, real identities or notifications.

Leave the active migration manifest, historical migrations and installation tip
unchanged. Before applying the prepared migration, reconcile the live issuer
definitions and dependencies, pgcrypto namespace, Vault extension/ACLs, encryption
key recovery and private-table permissions. Existing QR credentials must not be
replaced or backfilled with guessed values. Verify recovery evidence and rehearse
the reviewed DDL in a bounded rollback-only transaction through the protected
release workflow. Do not reset/replay history or send QA notifications.

The schema must be released before deploying the stable-reprint UI. Regenerate
the hosted types after approved release; the prepared contract currently lives
in the existing forward-type overlay. An application rollback can retain the
compatible issuer wrappers, encrypted data and key. Human PR/merge approval and
protected production release remain required. Encryption key loss prevents
reprinting saved copies but does not invalidate scanner hashes or printed codes.
