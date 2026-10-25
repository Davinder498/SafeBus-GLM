-- Operator export for the next offline monthly import preparation.
-- Run only after the reviewed directory migration is installed. Save the single
-- JSON result as current-directory.json. Contains organizational reference data.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select jsonb_build_object(
  'sourceSha256',(select source_sha256 from safebus_private.authority_directory_import_state where singleton),
  'records',coalesce((select jsonb_agg(to_jsonb(d)-'imported_at' order by authority_code)
    from safebus_private.authority_reference_directory d),'[]'::jsonb)
) as directory_baseline;
rollback;
