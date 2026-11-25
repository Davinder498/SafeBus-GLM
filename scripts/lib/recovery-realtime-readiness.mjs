// A missing managed partition can fail dispatch with SQLSTATE 23514.
// This preflight only reads the catalog; partition maintenance belongs to Realtime.
const partitionQuery = `
with target as (
  select (clock_timestamp() at time zone 'UTC')::date as today,
    to_regclass('realtime.messages') as parent
),
partitions as (
  select c.relname, pg_get_expr(c.relpartbound, c.oid) as bounds
  from target
  join pg_inherits i on i.inhparent = target.parent
  join pg_class c on c.oid = i.inhrelid
),
ready_days as (
  select day_offset
  from target
  cross join (values (0), (1)) as days(day_offset)
  join partitions p on p.relname = 'messages_' || to_char(today + day_offset, 'YYYY_MM_DD')
    and p.bounds = format('FOR VALUES FROM (%L) TO (%L)',
      to_char(today + day_offset, 'YYYY-MM-DD') || ' 00:00:00',
      to_char(today + day_offset + 1, 'YYYY-MM-DD') || ' 00:00:00')
)
select today::text as utc_day, parent is not null as catalog_present,
  (select count(*)::int from partitions) as partition_count,
  (select max(relname::text) from partitions
    where relname ~ '^messages_[0-9]{4}_[0-9]{2}_[0-9]{2}$') as latest_named_partition,
  exists(select 1 from ready_days where day_offset = 0) as today_ready,
  exists(select 1 from ready_days where day_offset = 1) as tomorrow_ready
from target
`;

export async function inspectRecoveryRealtimePartitions(db) {
  const { rows: [row] } = await db.query(partitionQuery);
  return {
    utcDay: row.utc_day,
    catalogPresent: row.catalog_present,
    partitionCount: row.partition_count,
    latestNamedPartition: row.latest_named_partition,
    todayReady: row.today_ready === true,
    tomorrowReady: row.tomorrow_ready === true,
  };
}
