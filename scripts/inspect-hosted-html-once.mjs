// Temporary, credential-free diagnostic on an investigation branch.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = '.safebus-public-html-inspection';
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const expected = '398e545bc297da492bbe5103fc29c90ac1ebfa869600e17359d4eb216fb0dbbb';
const hosts = [
  '6af3debff431a07fed91d30b--bussafe.netlify.app',
  '6af3dc436a8c8c30c92c462f--bussafe.netlify.app',
];
const results = [];
for (const host of hosts) {
  for (const variant of ['original', 'identity', 'fresh', 'root']) {
    const suffix = variant === 'root' ? '/' : '/index.html';
    const url = `https://${host}${suffix}` + (variant === 'fresh' ? '?safebus-inspect=1' : '');
    const headers = variant === 'identity' ? { 'accept-encoding': 'identity' } :
      variant === 'fresh' ? { 'cache-control': 'no-cache' } : {};
    try {
      const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (length + value.length > 65536) { truncated = true; await reader.cancel(); break; }
        length += value.length;
        chunks.push(value);
      }
      const body = Buffer.concat(chunks);
      const sha256 = createHash('sha256').update(body).digest('hex');
      const metadata = {};
      for (const name of ['content-type', 'content-encoding', 'content-length', 'etag', 'cache-status', 'x-nf-request-id', 'age']) {
        metadata[name] = response.headers.get(name)?.replace(/[^a-zA-Z0-9 _.,;=:/"-]/g, '?').slice(0, 240) ?? null;
      }
      const result = { host, variant, status: response.status, bytes: body.length, truncated, sha256, matches: sha256 === expected, metadata };
      results.push(result);
      await fs.writeFile(`${directory}/${host}-${variant}.html`, body, { mode: 0o600 });
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = { host, variant, error: error.name };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
}
await fs.writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 });
