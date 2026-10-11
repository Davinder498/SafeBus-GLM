// Offline owner utilities. Never connects to a hosted database or performs a restore.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decryptBackupFile, fileDigest } from './lib/security-backup.mjs';
import { verifyRecovery } from './lib/existing-security-install.mjs';
import { digest } from './lib/existing-security-rehearsal.mjs';

const [command, ...args] = process.argv.slice(2);
const json = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
function outsideRepository(directory) {
  const root = path.resolve(process.cwd()).toLowerCase();
  const selected = path.resolve(directory).toLowerCase();
  if (selected === root || selected.startsWith(root + path.sep))
    throw new Error('Keep keys and decrypted backups outside the repository.');
}
try {
  if (command === 'keypair' && args.length === 1) {
    const directory = path.resolve(args[0]);
    outsideRepository(directory);
    await fs.mkdir(directory, { mode: 0o700 });
    if (process.platform === 'win32') {
      const account = process.env.USERDOMAIN + '\\' + process.env.USERNAME;
      execFileSync(
        'icacls',
        [
          directory,
          '/inheritance:r',
          '/grant:r',
          account + ':(OI)(CI)F',
          '/grant:r',
          'SYSTEM:(OI)(CI)F',
        ],
        { windowsHide: true, stdio: 'pipe' },
      );
    }
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 3072,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    await fs.writeFile(path.join(directory, 'recovery-private.pem'), keys.privateKey, {
      flag: 'wx',
      mode: 0o600,
    });
    await fs.writeFile(path.join(directory, 'recovery-public.pem'), keys.publicKey, {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      'Recovery keypair created in the owner-only directory. Retain the private key offline.',
    );
  } else if (command === 'decrypt' && args.length === 3) {
    const [artifact, privateKeyFile, directory] = args.map((value) => path.resolve(value));
    outsideRepository(privateKeyFile);
    outsideRepository(directory);
    await fs.mkdir(directory, { mode: 0o700 });
    if (process.platform === 'win32') {
      const account = process.env.USERDOMAIN + '\\' + process.env.USERNAME;
      execFileSync(
        'icacls',
        [
          directory,
          '/inheritance:r',
          '/grant:r',
          account + ':(OI)(CI)F',
          '/grant:r',
          'SYSTEM:(OI)(CI)F',
        ],
        { windowsHide: true, stdio: 'pipe' },
      );
    }
    const privateKey = await fs.readFile(privateKeyFile, 'utf8');
    const backup = await json(path.join(artifact, 'backup.json'));
    for (const [name, envelope, output] of [
      ['database', backup.archive, 'database.dump'],
      ['roles', backup.roles, 'roles.sql'],
    ]) {
      await decryptBackupFile(
        path.join(artifact, name + '.enc'),
        path.join(directory, output),
        envelope,
        privateKey,
      );
    }
    // This validates archive readability, not an actual database restoration.
    execFileSync(
      'pg_restore',
      ['--exit-on-error', '--file', os.devNull, path.join(directory, 'database.dump')],
      { windowsHide: true, stdio: 'pipe', timeout: 12 * 60 * 1000 },
    );
    console.log(
      'Decrypted hashes and complete archive decoding verified. Full restoration is still required.',
    );
  } else if (command === 'receipt' && args.length === 4) {
    const [artifact, decrypted, proofFile, outputFile] = args.map((value) => path.resolve(value));
    outsideRepository(decrypted);
    outsideRepository(outputFile);
    const backup = await json(path.join(artifact, 'backup.json'));
    const catalog = await json(path.join(artifact, 'catalog-before.json'));
    const receipt = await json(proofFile);
    if (
      (await fileDigest(path.join(decrypted, 'database.dump'))) !==
        backup.archive.plaintextSha256 ||
      (await fileDigest(path.join(decrypted, 'roles.sql'))) !== backup.roles.plaintextSha256
    )
      throw new Error('Decrypted files do not match the source backup.');
    const receiptSha256 = digest(JSON.stringify(receipt));
    verifyRecovery({
      backup,
      catalog,
      receipt,
      receiptSha256,
      binding: backup,
      inputs: backup.inputs,
    });
    await fs.writeFile(outputFile, JSON.stringify(receipt, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log('Validated human restore receipt SHA256: ' + receiptSha256);
  } else {
    console.log('Usage: node scripts/security-recovery-tools.mjs keypair <new-owner-directory>');
    console.log(
      '       node scripts/security-recovery-tools.mjs decrypt <artifact-directory> <private-key-file> <new-decrypted-directory>',
    );
    console.log(
      '       node scripts/security-recovery-tools.mjs receipt <artifact-directory> <decrypted-directory> <human-restore-proof.json> <new-receipt.json>',
    );
    process.exitCode = 1;
  }
} catch {
  console.error(
    'Recovery utility failed. Check input paths, owner permissions, backup integrity and complete restore proof. No hosted changes were made.',
  );
  process.exitCode = 1;
}
