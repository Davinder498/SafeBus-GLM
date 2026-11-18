// Integer microdegrees avoid binary-addition tails which PostgreSQL's hosted
// extra_float_digits=0 output normalizes. Keep exact acknowledgement comparisons.
export function capacityGpsLatitude(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw Error('CAPACITY_GPS_SEQUENCE');
  return (52260000 + (sequence % 1000)) / 1000000;
}

export function assertCapacityGpsAck(row, trip, latitude) {
  if (
    !row ||
    Array.isArray(row) ||
    row.driver_trip_id !== trip ||
    row.latitude !== latitude ||
    row.longitude !== -113.81
  )
    throw Error('CAPACITY_GPS_ACK_MISMATCH');
}
