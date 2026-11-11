// Exact two-phase schema contract for the reviewed agreement-order rollout.
// No unknown RPC, changed argument, unrelated type difference or partial installation is accepted.
import { generateFromOpenApi } from './openapi-database-types.mjs';
const definitions = {
  district_agreement_order_matches: {
    p_tenant_id: { type: 'string', format: 'uuid' },
    p_interval: { type: 'string' },
    p_quantity: { type: 'integer' },
    p_collection_method: { type: 'string' },
  },
};
export function matchesAgreementOrderTypeTransition(generated, committed) {
  const paths = Object.fromEntries(
    Object.entries(definitions).map(([name, properties]) => [
      '/rpc/' + name,
      {
        post: {
          parameters: [{ in: 'body', schema: { properties, required: Object.keys(properties) } }],
        },
      },
    ]),
  );
  const expected = generateFromOpenApi({ definitions: {}, paths });
  let remainder = generated;
  for (const name of Object.keys(definitions)) {
    if (committed.includes(`      ${name}: {`)) return false;
    const pattern = new RegExp(`^      ${name}: \\{[\\s\\S]*?^      \\}\\n`, 'm');
    const block = expected.match(pattern)?.[0];
    if (!block || remainder.match(pattern)?.[0] !== block) return false;
    remainder = remainder.replace(pattern, '');
    if (remainder.includes(`      ${name}: {`)) return false;
  }
  return remainder === committed;
}

export async function extendAgreementOrderAuthorization(client, config, audiences) {
  const added = config.functions.filter(
    (f) => f.before === null && f.signature.startsWith('public.'),
  );
  const detected = await client.query(
    'select count(*)::int count from unnest($1::text[]) s where to_regprocedure(s) is not null',
    [added.map((f) => f.signature)],
  );
  if (detected.rows[0].count === 0) return false;
  if (detected.rows[0].count !== added.length)
    throw Error('Partial agreement order RPC installation.');
  for (const f of config.functions) {
    const r = (
      await client.query(
        'select md5(pg_get_functiondef(oid)) md5,pg_get_userbyid(proowner) owner from pg_proc where oid=to_regprocedure($1)',
        [f.signature],
      )
    ).rows[0];
    if (r?.md5 !== f.after || r?.owner !== 'postgres')
      throw Error('Agreement order RPC definition differs from its reviewed rollout.');
  }
  const prepare = 'prepare_my_district_agreement_order(uuid,jsonb)';
  const matches = 'district_agreement_order_matches(uuid,text,integer,text)';
  audiences.authenticated.add(prepare);
  audiences.allPublic.add(prepare);
  audiences.serviceRole.add(matches);
  audiences.allPublic.add(matches);
  audiences.serviceExecutable.add(matches);
  return true;
}
