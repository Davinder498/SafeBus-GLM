# Small-fleet tracking scheduler — November 20, 2026

Production observation found 16 active shared jobs and one legacy job, each
scheduled every second. One trip was active and the shared queue was empty.
The entire pg_cron execution history occupied approximately 1,402 MB.

The proposed schedule runs one shared job and keeps the existing legacy job.
It checks the existing index and visits only shards with ready work, oldest
first, up to 16 trips per shard. A 450 ms loop budget prevents starting a new
batch late in the run. Existing statement and lock timeouts still apply.
The original jobs remain in the catalog to preserve their history and permit
rollback. The existing history cleaner still recognizes the active job ID.
No run-history deletion or compaction is part of this change.

This reduces the scheduled tracking runs from 17 to 2 per second, excluding
the existing once-per-minute history cleaner. This change is for the small
fleet only. It does not calibrate the full target of 10,000 buses and 500,000
simultaneous guardian map viewers. Pickup and drop-off notification delivery
has a separate workload and requires its own capacity test alongside maps.

Use the protected operational workflow milestone `compact_shared_tracking`.
Its rehearsal verifies the observed schedules and reinstates the original
command and active flags before rolling back. After installation, check the
age and size of the shared queue, timeouts, GPS acceptance and guardian
freshness during an active trip. Compare to the previous run rate. If work
builds up across successive GPS cycles, investigate and restore the original
schedule using the protected recovery evidence. Size the next worker design
using measured work and progress, before increasing fleet admission.

After reducing new history growth, review the retained job history separately
and plan the removal and storage reclamation of expired execution records.
The current release reuses the existing cleanup job and retention policy.

## Production follow-up

The compact schedule is live. Both tracking jobs completed successfully.
The cron execution history was about 1,530 MB. The separate minute-by-minute
history cleaner was repeatedly hitting its 750 ms statement timeout before
advancing its cursor.

The `tracking_history_worker_timeout` protected milestone gives the existing
cleaner up to eight seconds per run. Its one-minute schedule, 100 ms lock
timeout, 5,000-record scan limit, 48-hour retention window and tracking-job
allowlist remain in force. Verify a successful cleanup run and advancing cursor
after deployment. Observe disk usage before planning a table rewrite. A
successful delete frees space for reuse inside the table, and a table rewrite
to return disk space requires separate maintenance planning.
