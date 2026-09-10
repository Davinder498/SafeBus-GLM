import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, '..');
const masterSourcePath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-master-source.png');
const masterPath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-master-mark.png');
const playDirectory = path.join(mobileDirectory, 'assets', 'google-play');

await sharp(masterSourcePath)
  .resize(1024, 1024, { fit: 'contain' })
  .png({ compressionLevel: 9 })
  .toFile(masterPath);

const featureBackground = Buffer.from(`
  <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#071d49"/>
        <stop offset="0.55" stop-color="#0b4d9f"/>
        <stop offset="1" stop-color="#1598f4"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#60a5fa"/>
        <stop offset="1" stop-color="#e0f2fe"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#001334" flood-opacity="0.45"/>
      </filter>
    </defs>
    <rect width="1024" height="500" fill="url(#background)"/>
    <path d="M-50 465 L420 0 H585 L115 500 Z" fill="#1686dc" opacity="0.30"/>
    <path d="M700 500 L1024 175 V350 L870 500 Z" fill="#38bdf8" opacity="0.24"/>
    <path d="M18 378 C180 278 253 456 401 390 C557 320 699 430 1002 306" fill="none" stroke="#60a5fa" stroke-width="7" stroke-linecap="round" stroke-dasharray="15 17" opacity="0.70"/>
    <g fill="#fbbf24" stroke="#fff7d6" stroke-width="3" filter="url(#shadow)">
      <circle cx="28" cy="371" r="10"/>
      <circle cx="1000" cy="307" r="10"/>
    </g>
    <text x="408" y="193" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="800" letter-spacing="-3" filter="url(#shadow)">BusSafe</text>
    <text x="408" y="285" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="800" letter-spacing="-3" filter="url(#shadow)">Alberta</text>
    <text x="412" y="344" fill="url(#accent)" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">Track the bus. Stay informed.</text>
  </svg>
`);

const featureMark = await sharp(masterPath)
  .resize(320, 320, { fit: 'contain' })
  .png({ compressionLevel: 9 })
  .toBuffer();

await Promise.all([
  sharp(masterPath)
    .png({ compressionLevel: 9 })
    .toFile(path.join(mobileDirectory, 'assets', 'logo.png')),
  sharp(masterPath)
    .resize(512, 512, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'app-icon-512.png')),
  sharp(featureBackground)
    .composite([{ input: featureMark, left: 48, top: 82 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'feature-graphic-1024x500.png')),
]);

console.log('Generated the 1024 px master, Android source logo, Play icon, and feature graphic.');
