import fs from 'node:fs';
import path from 'node:path';
import { prepareReturn, confirmReturnDelivery, digest } from './lib/assisted-return.mjs';

// Offline workstation tool: no network, credentials, SQL, delivery or deletion.
// prepare request.json INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY
// confirm PACKAGE_DIRECTORY receipt.json
const [mode, source, destination, output] = process.argv.slice(2);
function readText(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error('RETURN_INVALID_INPUT_FILE');
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}
const read = (file) => JSON.parse(readText(file));
const write = (file, content) => fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
try {
  if (mode === 'prepare') {
    if (!output || !destination) throw new Error('RETURN_INPUT_AND_OUTPUT_REQUIRED');
    const request = read(source);
    const result = await prepareReturn(request, async ({ policy, recordId }) =>
      read(path.join(destination, `${policy}-${recordId}.json`)),
    );
    // Atomic creation rejects existing paths, including symlinks; never check then create.
    fs.mkdirSync(output, { mode: 0o700 });
    for (const file of result.files) write(path.join(output, file.name), file.content);
    const manifest = JSON.stringify(result.manifest, null, 2) + '\n';
    write(path.join(output, 'manifest.json'), manifest);
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
      return { name: file.name, content: readText(full) };
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
