// Read-only Recovery preflight. A missing managed Realtime partition makes
// shared worker dispatch fail with SQLSTATE 23514, not a capacity result.
// Never create/repair Supabase-owned partitions from an application test.
const partitionQuery = `
with utc_days as (
  select (clock_timestamp() at time zone 'UTC')::date as today
)
select
  count(*)::int as partition_count,
  coalesce(bool_or(
    c.relname = 'messages_' || to_char(utc_days.today, 'YYYY_MM_DD')
    and pg_get_expr(c.relpartbound,c.oid) like
      'FOR VALUES FROM (' ||
      quote_literal(to_char(utc_days.today, 'YYYY-MM-DD') || ' 00:00:00') || ')%'
  ), false) as today_ready,
  coalesce(bool_or(
    c.relname = 'messages_' || to_char(utc_days.today + 1, 'YYYY_MM_DD')
    and pg_get_expr(c.relpartbound,c.oid) like
      'FOR VALUES FROM (' ||
      quote_literal(to_char(utc_days.today + 1, 'YYYY-MM-DD') || ' 00:00:00') || ')%'
  ), false) as tomorrow_ready
from utc_days
left join pg_inherits i on i.inhparent='realtime.messages'::regclass
left join pg_class c on c.oid=i.inhrelid
`;

export async function assertRecoveryRealtimePartitions(db) {
  const result = await db.query(partitionQuery);
  const row = result.rows?.[0];
  if (!row || row.today_ready !== true || row.tomorrow_ready !== true) {
    // Deliberately do not alter the provider-managed realtime schema or
    // proceed to expensive synthetic driver account provisioning.
    throw Error('CAPACITY_REALTIME_PARTITION_NOT_READY');
  }
  return { todayReady: true, tomorrowReady: true, partitionCount: Number(row.partition_count) };
}
