import { randomUUID, randomBytes, createHash } from 'node:crypto';

export async function seedCapacityFleetInLanes({ tenants, connect, assertRunning, seed }) {
  // Bus inserts lock the district row while checking its licensed bus count.
  const indexesByTenant = Map.groupBy(tenants.keys(), (index) => tenants[index]);
  let failure;
  const lanes = await Promise.allSettled(
    Array.from(indexesByTenant.values(), async (indexes) => {
      let connection;
      try {
        assertRunning();
        connection = await connect('safebus-capacity-fixture');
        for (const index of indexes) {
          if (failure) break;
          assertRunning();
          await seed(connection, index);
        }
      } catch (error) {
        failure ??= error;
        throw error;
      } finally {
        if (connection) await connection.end();
      }
    }),
  );
  if (failure) throw failure;
  const closeFailure = lanes.find((lane) => lane.status === 'rejected');
  if (closeFailure) throw closeFailure.reason;
}

export async function seedCapacityTenant(db, scope, index, issuer) {
  const tenant = scope.tenantIds[index];
  // Synthetic entitlement/contract state, not Stripe activity or a legal receipt.
  await db.query(
    `insert into safebus_private.agreement_packages(tenant_id,revision,document_ids,bundle_sha256,status,issued_by)
    values($1,1,'{}',repeat('0',64),'executed',$2)`,
    [tenant, issuer],
  );
  await db.query(
    `insert into safebus_private.tenant_subscription_projections
    (tenant_id,external_subscription_id,external_price_id,product_name,status,licensed_bus_count,currency,unit_amount,trial_end,provider_event_created_at)
    values($1,$2,'capacity_synthetic','Capacity synthetic','trialing',$3,'cad',199,now()+interval '1 day',now())`,
    [tenant, `capacity_${scope.run}_${index}`, Math.max(scope.buses, 500)],
  );
}
export async function seedCapacityBus(db, tenant, profile, index) {
  const ids = Object.fromEntries(
    [
      'driver',
      'bus',
      'route',
      'forward',
      'reverse',
      'stop1',
      'stop2',
      'assignment',
      'trip',
      'qr',
      'session',
    ].map((k) => [k, randomUUID()]),
  );
  const token = 'sbus_track_v1_' + randomBytes(32).toString('base64url');
  const busNumber = `CAP-${index}`;
  await db.query('begin');
  try {
    await db.query('insert into public.drivers(id,tenant_id,profile_id) values($1,$2,$3)', [
      ids.driver,
      tenant,
      profile,
    ]);
    await db.query(
      'insert into public.buses(id,tenant_id,bus_number,license_plate,capacity) values($1,$2,$3,$3,60)',
      [ids.bus, tenant, busNumber],
    );
    await db.query(
      "insert into public.routes(id,tenant_id,route_name,route_code,route_type) values($1,$2,$3,$3,'morning')",
      [ids.route, tenant, `Capacity ${index}`],
    );
    for (const [direction, id] of [
      ['forward', ids.forward],
      ['reverse', ids.reverse],
    ])
      await db.query(
        'insert into public.route_trip_patterns(id,tenant_id,route_id,direction,display_name) values($1,$2,$3,$4,$4)',
        [id, tenant, ids.route, direction],
      );
    for (const [order, id, lat] of [
      [1, ids.stop1, 52.26],
      [2, ids.stop2, 52.27],
    ])
      await db.query(
        'insert into public.route_stops(id,tenant_id,route_id,stop_name,stop_order,latitude,longitude) values($1,$2,$3,$4,$5,$6,-113.81)',
        [id, tenant, ids.route, `Synthetic ${order}`, order, lat],
      );
    await db.query(
      "insert into public.bus_route_assignments(id,tenant_id,bus_id,route_id,trip_type,route_trip_pattern_id) values($1,$2,$3,$4,'morning',$5)",
      [ids.assignment, tenant, ids.bus, ids.route, ids.forward],
    );
    await db.query(
      "insert into public.driver_trips(id,tenant_id,driver_id,bus_id,route_id,trip_type,route_trip_pattern_id,trip_name_snapshot) values($1,$2,$3,$4,$5,'morning',$6,'Capacity synthetic')",
      [ids.trip, tenant, ids.driver, ids.bus, ids.route, ids.forward],
    );
    await db.query(
      'insert into public.bus_qr_credentials(id,tenant_id,bus_id,token_hash,created_by) values($1,$2,$3,$4,$5)',
      [
        ids.qr,
        tenant,
        ids.bus,
        createHash('sha256').update(randomBytes(32)).digest('hex'),
        profile,
      ],
    );
    await db.query(
      'insert into public.bus_tracking_sessions(id,tenant_id,driver_trip_id,driver_id,bus_id,bus_qr_credential_id,session_token_hash) values($1,$2,$3,$4,$5,$6,$7)',
      [
        ids.session,
        tenant,
        ids.trip,
        ids.driver,
        ids.bus,
        ids.qr,
        createHash('sha256').update(token).digest('hex'),
      ],
    );
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  return {
    ...ids,
    token,
    busNumber,
    tenant,
    topic:
      'safebus:bus:' +
      createHash('sha256')
        .update(ids.trip + ':safebus:bus:v1')
        .digest('hex'),
  };
}
export async function seedCapacityNativeDevice(db, bus, account) {
  const id = randomUUID();
  const credential = 'sbus_device_v1_' + randomBytes(32).toString('base64url');
  await db.query(
    `insert into public.driver_tracking_devices
       (id,tenant_id,driver_id,profile_id,installation_id,credential_hash,
        platform,ownership,app_version,privacy_notice_version,privacy_notice_acknowledged_at)
     values($1,$2,$3,$4,$5,safebus_private.hash_driver_device_credential($6),
       'android','personal','capacity-probe','driver-location-byod-v1',now())`,
    [id, bus.tenant, bus.driver, account.id, randomUUID(), credential],
  );
  const bound = await db.query(
    'update public.bus_tracking_sessions set device_id=$1 where id=$2 and driver_id=$3',
    [id, bus.session, bus.driver],
  );
  if (bound.rowCount !== 1) throw Error('CAPACITY_ANDROID_DEVICE_BINDING');
  return {
    tripId: bus.trip,
    accessToken: account.token,
    trackingToken: bus.token,
    deviceCredential: credential,
  };
}

export async function seedCapacityGuardian(db, bus, account, index) {
  const guardian = randomUUID(),
    student = randomUUID();
  await db.query('begin');
  try {
    await db.query(
      "insert into public.guardians(id,tenant_id,profile_id,full_name,first_name,last_name,email) values($1,$2,$3,'Synthetic Guardian','Synthetic','Guardian',$4)",
      [guardian, bus.tenant, account.id, account.email],
    );
    await db.query(
      "insert into public.students(id,tenant_id,first_name,last_name) values($1,$2,$3,'Synthetic')",
      [student, bus.tenant, `Capacity${index}`],
    );
    await db.query(
      'insert into public.student_guardians(tenant_id,student_id,guardian_id) values($1,$2,$3)',
      [bus.tenant, student, guardian],
    );
    await db.query(
      'insert into public.student_bus_assignments(tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,pickup_stop_id,dropoff_stop_id,seat_number) values($1,$2,$3,$4,$5,$6,$7)',
      [bus.tenant, student, bus.assignment, bus.forward, bus.stop1, bus.stop2, index + 1],
    );
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  return { guardian, student };
}
