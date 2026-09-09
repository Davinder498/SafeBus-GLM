#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_CAPACITOR_PACKAGES = [
  '@capacitor/android',
  '@capacitor/app',
  '@capacitor/core',
  '@capacitor/geolocation',
  '@capacitor/haptics',
  '@capacitor/keyboard',
  '@capacitor/push-notifications',
  '@capacitor/splash-screen',
];

const REQUIRED_IMAGES = new Map([
  ['apps/mobile/assets/brand/safebus-master-mark.png', [1024, 1024]],
  ['apps/mobile/assets/google-play/app-icon-512.png', [512, 512]],
  ['apps/mobile/assets/google-play/feature-graphic-1024x500.png', [1024, 500]],
  ['apps/mobile/assets/google-play/screenshots/01-guardian-live-status.png', [1080, 1920]],
  ['apps/mobile/assets/google-play/screenshots/02-guardian-trip-updates.png', [1080, 1920]],
  ['apps/mobile/assets/google-play/screenshots/03-driver-active-trip.png', [1080, 1920]],
  ['apps/mobile/assets/google-play/screenshots/04-driver-trip-history.png', [1080, 1920]],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function readPngDimensions(filename) {
  const handle = await fs.open(filename, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    invariant(bytesRead === header.length, `${filename} is not a complete PNG.`);
    invariant(
      header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      `${filename} is not a PNG.`,
    );
    return [header.readUInt32BE(16), header.readUInt32BE(20)];
  } finally {
    await handle.close();
  }
}

export async function verifyAndroidPublicationFiles(root = process.cwd()) {
  const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');
  const [
    mobilePackage,
    envExample,
    variables,
    manifest,
    capacitorConfig,
    workflow,
    webRoutes,
    mobileRoutes,
    accountSettings,
  ] = await Promise.all([
    read('apps/mobile/package.json').then(JSON.parse),
    read('apps/mobile/.env.example'),
    read('apps/mobile/android/variables.gradle'),
    read('apps/mobile/android/app/src/main/AndroidManifest.xml'),
    read('apps/mobile/capacitor.config.ts'),
    read('.github/workflows/release-android.yml'),
    read('apps/web/src/routes/router.tsx'),
    read('apps/mobile/src/routes/router.tsx'),
    read('apps/web/src/pages/AccountSettingsPage.tsx'),
  ]);

  for (const packageName of REQUIRED_CAPACITOR_PACKAGES) {
    const version = mobilePackage.dependencies?.[packageName];
    invariant(
      /^8\.[0-9]+\.[0-9]+$/.test(version ?? ''),
      `${packageName} must be exactly pinned to Capacitor 8.`,
    );
  }
  invariant(
    !mobilePackage.dependencies?.['@capacitor/status-bar'],
    'The legacy status-bar plugin must not be used for Android 16 edge-to-edge handling.',
  );
  invariant(/targetSdkVersion = 36/.test(variables), 'Android targetSdkVersion must be 36.');
  invariant(/compileSdkVersion = 36/.test(variables), 'Android compileSdkVersion must be 36.');
  invariant(
    /\|navigation\|density"/.test(manifest),
    'Android configChanges must include navigation and density.',
  );
  invariant(
    /SystemBars:[\s\S]*insetsHandling: 'css'/.test(capacitorConfig),
    'Capacitor SystemBars CSS inset handling is required.',
  );

  const envNames = [...envExample.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=/gm)].map((match) => match[1]);
  invariant(
    JSON.stringify(envNames.sort()) ===
      JSON.stringify(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL']),
    'Mobile .env.example may contain only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );

  invariant(
    /version_code:/.test(workflow) && /version_name:/.test(workflow),
    'Android workflow requires explicit version inputs.',
  );
  invariant(
    /SAFEBUS_REQUIRE_RELEASE_SIGNING: true/.test(workflow),
    'Android workflow must require release signing.',
  );
  invariant(/path: '\/privacy'/.test(webRoutes), 'The public privacy route is missing.');
  invariant(
    /path: '\/account-deletion'/.test(webRoutes),
    'The public account-deletion route is missing.',
  );
  invariant(/path: '\/privacy'/.test(mobileRoutes), 'The mobile privacy route is missing.');
  invariant(
    /path: '\/account-deletion'/.test(mobileRoutes),
    'The mobile account-deletion route is missing.',
  );
  for (const href of ['/privacy', '/privacy#contact', '/account-deletion']) {
    invariant(accountSettings.includes(`href="${href}"`), `Account settings is missing ${href}.`);
  }

  const images = {};
  for (const [relativePath, expected] of REQUIRED_IMAGES) {
    const actual = await readPngDimensions(path.join(root, relativePath));
    invariant(
      actual[0] === expected[0] && actual[1] === expected[1],
      `${relativePath} must be ${expected[0]}x${expected[1]}; found ${actual[0]}x${actual[1]}.`,
    );
    images[relativePath] = `${actual[0]}x${actual[1]}`;
  }

  return { applicationId: 'com.safebusalberta.app', targetSdk: 36, images };
}

export async function verifyAndroidPublicationOnline({ fetchImpl = fetch } = {}) {
  const origin = (process.env.SAFEBUS_PUBLIC_WEB_ORIGIN ?? 'https://bussafe.netlify.app').replace(
    /\/$/,
    '',
  );
  const publicPages = ['/privacy', '/account-deletion'];

  for (const pathname of publicPages) {
    const response = await fetchImpl(`${origin}${pathname}`, { redirect: 'follow' });
    invariant(response.ok, `${origin}${pathname} is not publicly available.`);
    invariant(
      (await response.text()).includes('id="root"'),
      `${origin}${pathname} did not return the SafeBus web application.`,
    );
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  invariant(
    supabaseUrl && anonKey,
    'Production Supabase URL and anon key are required for the read-only auth check.',
  );
  const authResponse = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  invariant(authResponse.ok, 'The read-only Supabase Auth settings check failed.');
  const authSettings = await authResponse.json();
  invariant(
    authSettings.disable_signup === true,
    'Public Supabase signup must be disabled before publication.',
  );

  return { publicOrigin: origin, publicSignupDisabled: true };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = { files: await verifyAndroidPublicationFiles() };
  if (process.argv.includes('--online')) result.online = await verifyAndroidPublicationOnline();
  console.log(JSON.stringify({ result: 'android_publication_preflight_passed', ...result }));
}
