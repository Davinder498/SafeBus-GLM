import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  constants,
} from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { digest } from './existing-security-rehearsal.mjs';

export function publicBackupKey(pem) {
  if (!pem?.includes('-----BEGIN PUBLIC KEY-----'))
    throw new Error('Backup RSA public key is required.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072)
    throw new Error('Backup encryption requires an RSA public key of at least 3072 bits.');
  return key;
}

export async function encryptBackupStream(source, filename, publicKeyPem) {
  const recipient = publicBackupKey(publicKeyPem);
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const plaintext = createHash('sha256');
  const ciphertext = createHash('sha256');
  let plaintextBytes = 0;
  const count = new Transform({
    transform(chunk, encoding, callback) {
      plaintext.update(chunk);
      plaintextBytes += chunk.length;
      callback(null, chunk);
    },
  });
  const encryptedCount = new Transform({
    transform(chunk, encoding, callback) {
      ciphertext.update(chunk);
      callback(null, chunk);
    },
  });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  try {
    await pipeline(
      source,
      count,
      cipher,
      encryptedCount,
      createWriteStream(filename, { flags: 'wx', mode: 0o600 }),
    );
    return {
      format: 1,
      algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
      wrappedKey: publicEncrypt(
        { key: recipient, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
        key,
      ).toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      recipientSha256: digest(recipient.export({ type: 'spki', format: 'pem' })),
      plaintextSha256: plaintext.digest('hex'),
      ciphertextSha256: ciphertext.digest('hex'),
      plaintextBytes,
    };
  } finally {
    key.fill(0);
  }
}

export async function fileDigest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function decryptBackupFile(encryptedFile, outputFile, envelope, privateKeyPem) {
  if (
    envelope?.format !== 1 ||
    envelope.algorithm !== 'RSA-OAEP-SHA256/AES-256-GCM' ||
    (await fileDigest(encryptedFile)) !== envelope.ciphertextSha256
  )
    throw new Error('Encrypted backup checksum or format is invalid.');
  const key = privateDecrypt(
    { key: privateKeyPem, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(envelope.wrappedKey, 'base64'),
  );
  let created = false;
  let handle;
  try {
    // O_EXCL prevents overwriting existing data, even when decryption fails.
    handle = await fs.open(outputFile, 'wx', 0o600);
    created = true;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    await pipeline(createReadStream(encryptedFile), decipher, handle.createWriteStream());
    if ((await fileDigest(outputFile)) !== envelope.plaintextSha256)
      throw new Error('Decrypted backup checksum is invalid.');
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) await fs.unlink(outputFile).catch(() => {});
    throw error;
  } finally {
    await handle?.close().catch(() => {});
    key.fill(0);
  }
}

export function pgBackupEnvironment(databaseUrl, caFile) {
  const url = new URL(databaseUrl);
  if ((url.port || '5432') !== '5432')
    throw new Error('Backup requires the direct or session-mode connection on port 5432.');
  // Secrets are environment variables, never process arguments. Do not inherit other CI secrets.
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PGHOST: url.hostname,
    PGPORT: '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: caFile,
    PGCONNECT_TIMEOUT: '10',
    PGOPTIONS:
      '-c default_transaction_read_only=on -c lock_timeout=2000 -c statement_timeout=600000',
    PGAPPNAME: 'safebus-encrypted-security-backup',
  };
}

export async function captureEncryptedDump(binary, args, { directory, name, publicKeyPem, env }) {
  const filename = path.join(directory, name + '.enc');
  const child = spawn(binary, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // Discard provider stderr: it may contain SQL, row values, or connection details.
  child.stderr.resume();
  const completed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Backup client could not start.')));
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('PostgreSQL export failed.')),
    );
  });
  const timer = setTimeout(() => child.kill(), 12 * 60 * 1000);
  try {
    const [envelope] = await Promise.all([
      encryptBackupStream(child.stdout, filename, publicKeyPem),
      completed,
    ]);
    if (envelope.plaintextBytes < 100) throw new Error('Backup output is unexpectedly empty.');
    await fs.writeFile(
      path.join(directory, name + '.envelope.json'),
      JSON.stringify(envelope, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    return envelope;
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}
