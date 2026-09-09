import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, '..');
const masterSourcePath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-master-source.png');
const masterPath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-master-mark.png');
const featureSourcePath = path.join(
  mobileDirectory,
  'assets',
  'google-play',
  'feature-graphic-source.png',
);
const playDirectory = path.join(mobileDirectory, 'assets', 'google-play');

await sharp(masterSourcePath)
  .resize(1024, 1024, { fit: 'contain' })
  .png({ compressionLevel: 9 })
  .toFile(masterPath);

await Promise.all([
  sharp(masterPath)
    .png({ compressionLevel: 9 })
    .toFile(path.join(mobileDirectory, 'assets', 'logo.png')),
  sharp(masterPath)
    .resize(512, 512, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'app-icon-512.png')),
  sharp(featureSourcePath)
    .resize(1024, 500, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'feature-graphic-1024x500.png')),
]);

console.log('Generated the 1024 px master, Android source logo, Play icon, and feature graphic.');
