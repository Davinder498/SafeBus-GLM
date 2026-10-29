import { readFile } from 'node:fs/promises';
import {
  createPickupDropoffDb,
  databaseClient,
  id,
  recordEvent,
  startTrip,
} from './pickup-dropoff-copy-db.mjs';
export { databaseClient, id, recordEvent, startTrip };
const read = (path) => readFile(new URL('../../../' + path, import.meta.url), 'utf8');
export const readUnifiedMigration = () =>
  read('supabase/migrations/pending/20261029000139_unified_notification_delivery.sql');
export async function createUnifiedNotificationDb({ migrate = true } = {}) {
  const db = await createPickupDropoffDb();
  try {
    await db.exec(`alter table guardian_notification_outbox
      add available_after timestamptz default now(),add created_at timestamptz default now(),
      add attempt_count integer default 0,add claimed_at timestamptz,add claim_expires_at timestamptz,
      add last_attempted_at timestamptz,add failure_reason text,add failure_category text,
      add failed_at timestamptz,add cancelled_at timestamptz,add delivered_at timestamptz,
      add provider_message_id text,add updated_at timestamptz;
      create index email_due on guardian_notification_outbox(status,available_after);
    `);
    await db.exec(await read('tests/release/fixtures/unified-notifications-hosted-20261028.sql'));
    await db.exec(await read('tests/release/fixtures/unified-notifications-policy-baseline.sql'));
    await db.exec(`
      alter table guardian_notification_delivery_policies add constraint guardian_notification_policy_limits_check
       check(tenant_daily_limit between 1 and 100000 and tenant_per_minute_limit between 1 and 1000);
      alter table guardian_notification_delivery_policies add constraint guardian_notification_policy_push_limits_check
       check(push_tenant_daily_limit between 1 and 100000 and push_tenant_per_minute_limit between 1 and 1000);
      drop view cron.job;
      create table cron.job(jobid bigint primary key,jobname text,schedule text,active boolean,command text);
      insert into cron.job values(1,'safebus-push-notification-dispatcher','* * * * *',true,'fixture');
      create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null)
       returns void language sql as $$ update cron.job set schedule=coalesce($2,cron.job.schedule) where jobid=$1 $$;
    `);
    await db.exec(`alter table guardian_notification_delivery_policies alter column tenant_daily_limit set default 500,
      alter column tenant_per_minute_limit set default 20,alter column push_tenant_daily_limit set default 500,
      alter column push_tenant_per_minute_limit set default 20;`);
    const cronSql = await read(
      'supabase/migrations/0094_schedule_push_notification_dispatcher.sql',
    );
    await db.query('update cron.job set command=$1', [
      cronSql.match(/\$schedule\$([\s\S]*?)\$schedule\$/)[1].replaceAll('\r', ''),
    ]);
    await db.exec(await read('tests/release/fixtures/unified-notification-email-triggers.sql'));
    if (migrate) await db.exec(await readUnifiedMigration());
    await db.exec(
      'truncate user_notifications,push_notification_outbox,guardian_notification_outbox',
    );
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
