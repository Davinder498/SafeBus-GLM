import { withSupabase } from '@supabase/server';
import { validatePushProvider } from '../_shared/push-readiness-core.mjs';
import {
  createFcmSender,
  classifyFcmError,
  runPushDispatcher,
  timingSafeSecretEqual,
} from '../_shared/push-dispatcher-core.mjs';

type EnvironmentReader = (name: string) => string | undefined;
type SupabaseAdminClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  from: (name: string) => { select: (columns: string) => DeviceQuery };
};
type DeviceQuery = PromiseLike<{ data: Array<{ fcm_token: string }> | null; error: unknown }> & {
  eq: (column: string, value: string) => DeviceQuery;
  order: (column: string, options: { ascending: boolean }) => DeviceQuery;
  limit: (count: number) => DeviceQuery;
};

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function parseServiceAccount(rawValue: string | undefined) {
  try {
    const parsed = JSON.parse(rawValue || '');
    if (parsed?.type !== 'service_account') throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('configuration_error');
  }
}

export async function handleRequest(
  request: Request,
  supabaseAdmin: SupabaseAdminClient,
  dependencies: {
    readEnvironment?: EnvironmentReader;
    fetchImpl?: typeof fetch;
    randomUUID?: () => string;
  } = {},
) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const readEnvironment = dependencies.readEnvironment || ((name) => Deno.env.get(name));
  const expectedSecret = readEnvironment('SAFEBUS_PUSH_DISPATCHER_SECRET') || '';
  if (expectedSecret.length < 32) {
    return json(503, { error: 'Push dispatcher is not configured.' });
  }
  const suppliedSecret = request.headers.get('x-safebus-push-secret') || '';
  if (!(await timingSafeSecretEqual(suppliedSecret, expectedSecret))) {
    return json(401, { error: 'Unauthorized.' });
  }

  let mode = 'dispatch';
  if (request.body) {
    try {
      mode = (await request.json()).mode ?? 'dispatch';
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
  }
  if (!['dispatch', 'validate'].includes(mode)) return json(400, { error: 'Invalid mode.' });

  try {
    const serviceAccount = parseServiceAccount(
      readEnvironment('SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON'),
    );
    if (mode === 'validate') {
      const result = await validatePushProvider({
        findDevice: async () => {
          const device = await supabaseAdmin
            .from('android_push_devices')
            .select('fcm_token')
            .eq('status', 'active')
            .eq('permission_state', 'granted')
            .order('last_seen_at', { ascending: false })
            .limit(1);
          if (device.error) throw new Error('configuration_error');
          return device.data?.[0]?.fcm_token;
        },
        validate: createFcmSender(serviceAccount, {
          fetchImpl: dependencies.fetchImpl || fetch,
          validateOnly: true,
        }),
      });
      return json(200, result);
    }
    const rpc = async (name: string, parameters: Record<string, unknown>) => {
      const result = await supabaseAdmin.rpc(name, parameters);
      if (result.error) throw result.error;
      return result.data;
    };
    const send = createFcmSender(serviceAccount, {
      fetchImpl: dependencies.fetchImpl || fetch,
    });
    const batchSize = Math.max(
      1,
      Math.min(Number(readEnvironment('SAFEBUS_PUSH_BATCH_SIZE') || 50), 200),
    );
    const randomUUID = dependencies.randomUUID || (() => crypto.randomUUID());
    const summary = await runPushDispatcher({
      rpc,
      send,
      workerId: `supabase-edge-${randomUUID()}`,
      batchSize,
    });
    console.log(JSON.stringify({ result: 'push_dispatch_complete', ...summary }));
    return json(200, summary);
  } catch (error) {
    const failure =
      error instanceof Error && error.message === 'configuration_error'
        ? { category: 'configuration_error', code: 'INVALID_SERVICE_ACCOUNT' }
        : error instanceof Error && error.message === 'no_registered_device'
          ? { category: 'device_registration_missing', code: 'NO_REGISTERED_DEVICE' }
          : classifyFcmError(error);
    console.error(
      JSON.stringify({
        result: mode === 'validate' ? 'push_provider_validation_failed' : 'push_dispatcher_error',
        category: failure.category,
        code: failure.code,
      }),
    );
    return json(500, {
      error: mode === 'validate' ? 'Push provider validation failed.' : 'Push dispatcher failed.',
      ...(mode === 'validate'
        ? { failureCategory: failure.category, failureCode: failure.code }
        : {}),
    });
  }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (request, context) =>
    handleRequest(request, context.supabaseAdmin as unknown as SupabaseAdminClient),
  ),
};
