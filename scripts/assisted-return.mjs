import fs from 'node:fs';
import path from 'node:path';
import { prepareReturn, confirmReturnDelivery, digest } from './lib/assisted-return.mjs';

// Workstation-only operator tool. No service-role credentials, SQL, automatic delivery or deletion.
// Usage: node scripts/assisted-return.mjs prepare request.json NEW_DIRECTORY
//        node scripts/assisted-return.mjs confirm PACKAGE_DIRECTORY receipt.json
const [mode, source, destination] = process.argv.slice(2);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, content) => fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
try {
  if (mode === 'prepare') {
    const request = read(source);
    const token = process.env.SAFEBUS_RETURN_ACCESS_TOKEN;
    if (!token || /[\r\n]/.test(token)) throw new Error('RETURN_SIGN_IN_REQUIRED');
    if (!destination || fs.existsSync(destination))
      throw new Error('RETURN_NEW_DIRECTORY_REQUIRED');
    const result = await prepareReturn(request, async ({ policy, recordId }) => {
      const response = await fetch('https://safebus.kids/.netlify/functions/disposal-records', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'export', data: { policy, recordId } }),
      });
      if (!response.ok) throw new Error(`RETURN_EXPORT_HTTP_${response.status}`);
      const body = await response.json();
      // Existing endpoint permits 30 requests/minute. Stop on any error; never silently omit a record.
      await new Promise((resolve) => setTimeout(resolve, 2100));
      return body.result;
    });
    fs.mkdirSync(destination, { mode: 0o700 });
    for (const file of result.files) write(path.join(destination, file.name), file.content);
    const manifest = JSON.stringify(result.manifest, null, 2) + '\n';
    write(path.join(destination, 'manifest.json'), manifest);
    console.log(
      JSON.stringify({
        result: 'prepared_not_delivered',
        files: result.files.length,
        manifestSha256: digest(manifest),
      }),
    );
  } else if (mode === 'confirm') {
    const manifest = read(path.join(source, 'manifest.json'));
    const files = manifest.files.map((file) => {
      if (typeof file.name !== 'string' || !/^[a-z_]+-[0-9a-f-]{36}\.json$/i.test(file.name))
        throw new Error('RETURN_INVALID_FILE_NAME');
      const full = path.join(source, file.name);
      if (fs.lstatSync(full).isSymbolicLink()) throw new Error('RETURN_SYMLINK_REJECTED');
      return { name: file.name, content: fs.readFileSync(full, 'utf8') };
    });
    const completion = confirmReturnDelivery(manifest, files, read(destination));
    write(path.join(source, 'delivery-record.json'), JSON.stringify(completion, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'delivery_recorded', deletionPerformed: false }));
  } else throw new Error('RETURN_USAGE_PREPARE_OR_CONFIRM');
} catch (error) {
  const code = /^RETURN_[A-Z0-9_]+$/.test(error.message) ? error.message : 'RETURN_FAILED';
  console.error(JSON.stringify({ result: 'failed', code }));
  process.exitCode = 1;
}
