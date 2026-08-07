import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage } from 'node:http';
import { resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Vite dev plugin that serves Netlify Functions locally.
 *
 * In production, Netlify's platform serves `/.netlify/functions/<name>` from the
 * `apps/web/netlify/functions/<name>.mjs` files. During local development with
 * `vite` (i.e. `pnpm dev`), those requests would otherwise hit the SPA fallback
 * and return `index.html`, breaking the onboarding/auth flows.
 *
 * This plugin intercepts `/.netlify/functions/*` requests, dynamically imports
 * the corresponding handler module, invokes it with a Netlify-shaped event, and
 * returns the JSON response. It reads env vars from `process.env` so a local
 * `.env` file (loaded by Vite) supplies `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
 * etc. to the function runtime.
 *
 * SECURITY: Only runs during `vite dev` (serve). Never bundled into production.
 */

interface NetlifyHandlerEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string;
  isBase64Encoded: false;
}

interface NetlifyHandlerResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

type NetlifyHandler = (event: NetlifyHandlerEvent) => Promise<NetlifyHandlerResponse>;

const FUNCTION_PREFIX = '/.netlify/functions/';
const FUNCTIONS_DIR = fileURLToPath(new URL('./netlify/functions/', import.meta.url));

async function loadHandler(functionName: string): Promise<NetlifyHandler | null> {
  const filePath = resolve(FUNCTIONS_DIR, `${functionName}.mjs`);
  try {
    // Use pathToFileURL for Windows compatibility and reload edits during dev.
    const fileUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    if (typeof mod.handler !== 'function') {
      console.error(`[netlify-functions] ${functionName}.mjs does not export a "handler" function.`);
      return null;
    }
    return mod.handler as NetlifyHandler;
  } catch (error) {
    console.error(`[netlify-functions] Failed to load ${functionName}.mjs:`, error);
    return null;
  }
}

function buildEvent(req: IncomingMessage, body: Buffer): NetlifyHandlerEvent {
  const url = req.url ?? '';
  const [pathname, search = ''] = url.split('?');
  const queryStringParameters: Record<string, string> = {};
  if (search) {
    for (const pair of search.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (key) queryStringParameters[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }

  // Flatten headers to a simple string record (case-insensitive lookup handled by callers).
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }

  return {
    httpMethod: req.method ?? 'POST',
    path: pathname,
    headers,
    queryStringParameters,
    body: body.toString('utf8'),
    isBase64Encoded: false,
  };
}

export function netlifyFunctionsPlugin(): Plugin {
  return {
    name: 'safebus-netlify-functions',
    apply: 'serve', // dev only — never bundled for production
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(FUNCTION_PREFIX)) {
          return next();
        }

        // Extract function name: /.netlify/functions/<name> or /.netlify/functions/<name>?...
        const afterPrefix = url.slice(FUNCTION_PREFIX.length).split('?')[0] ?? '';
        const functionName = basename(afterPrefix);
        if (!functionName) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Function name not provided.' }));
          return;
        }

        // Read request body for POST/PUT/PATCH.
        const body: Buffer[] = [];
        await new Promise<void>((bodyReady) => {
          req.on('data', (chunk) => body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          req.on('end', () => bodyReady());
          req.on('error', () => bodyReady());
        });
        const bodyBuffer = Buffer.concat(body);

        const handler = await loadHandler(functionName);
        if (!handler) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error: `Function "${functionName}" not found. Ensure apps/web/netlify/functions/${functionName}.mjs exists.`,
            }),
          );
          return;
        }

        try {
          const event = buildEvent(req, bodyBuffer);
          const result = await handler(event);
          res.statusCode = result.statusCode ?? 200;
          const responseHeaders = { 'content-type': 'application/json', ...(result.headers ?? {}) };
          for (const [key, value] of Object.entries(responseHeaders)) {
            res.setHeader(key, value);
          }
          res.end(result.body ?? '');
        } catch (error) {
          console.error(`[netlify-functions] ${functionName} threw:`, error);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'The function crashed during local development. Check the Vite dev server terminal for the full error.',
            }),
          );
        }
      });
    },
  };
}
