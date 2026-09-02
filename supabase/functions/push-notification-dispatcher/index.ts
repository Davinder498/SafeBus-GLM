import { withSupabase } from '@supabase/server';
import {
  createFcmSender,
  runPushDispatcher,
  timingSafeSecretEqual,
} from '../_shared/push-dispatcher-core.mjs';

type EnvironmentReader = (name: string) => string | undefined;
type SupabaseAdminClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
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

  try {
    const serviceAccount = parseServiceAccount(
      readEnvironment('SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON'),
    );
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
    console.error(
      JSON.stringify({
        result: 'push_dispatcher_error',
        category:
          error instanceof Error && error.message === 'configuration_error'
            ? 'configuration_error'
            : 'unknown',
      }),
    );
    return json(500, { error: 'Push dispatcher failed.' });
  }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (request, context) =>
    handleRequest(request, context.supabaseAdmin as unknown as SupabaseAdminClient),
  ),
};
