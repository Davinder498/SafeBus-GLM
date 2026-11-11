import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export async function trackingReleaseFixture(t) {
  const db = new PGlite();
  t?.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'));
  await db.exec(`
    create function safebus_private.send_tracking_invalidation(text,text) returns void language sql as $$ select $$;
    create function safebus_private.send_guardian_tracking_invalidation(uuid,text) returns void language sql as $$ select $$;
    create function safebus_private.broadcast_route_tracking_invalidation(uuid,uuid,text) returns void language sql as $$ select $$;
    create or replace view cron.job as select name as jobname, schedule, command, true as active, current_user::text as username, jobid from cron.test_jobs;
    create function cron.alter_job(job_id bigint, schedule text, active boolean) returns void language sql as $$ update cron.test_jobs set schedule=$2 where jobid=$1 $$;
    create function cron.unschedule(p_id bigint) returns boolean language sql as $$ delete from cron.test_jobs where jobid=p_id returning true $$;
  `);
  const producer = await fs.readFile(
    'tests/release/fixtures/async-tracking-producer-hosted-20261110.sql',
    'utf8',
  );
  // The operational body checksum intentionally normalizes CRLF, but the full
  // catalog fingerprint does not. The November 10 recovery artifact retains
  // CRLF inside this original function body, not in its pg_get_functiondef header.
  await db.exec(
    producer.replace(
      /AS \$function\$([\s\S]*?)\$function\$/,
      (_, body) =>
        'AS $function$' + body.replaceAll('\r', '').replaceAll('\n', '\r\n') + '$function$',
    ),
  );
  await db.exec(
    `create trigger notify_tracking_location_change after insert or update on public.driver_trip_current_locations for each row execute function safebus_private.notify_tracking_location_change();`,
  );
  return db;
}
