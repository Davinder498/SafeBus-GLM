import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, '..');
const workspaceDirectory = path.resolve(mobileDirectory, '..', '..');
const masterSourcePath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-official-mark.svg');
const masterPath = path.join(mobileDirectory, 'assets', 'brand', 'safebus-master-mark.png');
const playDirectory = path.join(mobileDirectory, 'assets', 'google-play');
const mobilePublicDirectory = path.join(mobileDirectory, 'public');
const webPublicDirectory = path.join(workspaceDirectory, 'apps', 'web', 'public');
const androidResDirectory = path.join(mobileDirectory, 'android', 'app', 'src', 'main', 'res');

const brand = {
  navy: '#172B3A',
  yellow: '#FCD66B',
  canvas: '#F4E1A1',
};

await Promise.all([
  mkdir(playDirectory, { recursive: true }),
  mkdir(mobilePublicDirectory, { recursive: true }),
  mkdir(webPublicDirectory, { recursive: true }),
  mkdir(path.join(androidResDirectory, 'drawable-nodpi'), { recursive: true }),
]);

const officialMarkSource = await readFile(masterSourcePath, 'utf8');
const busOnlySource = Buffer.from(
  officialMarkSource.replace(/\s*<rect width="1024" height="1024"[^>]*\/>/, ''),
);

await sharp(masterSourcePath)
  .resize(1024, 1024, { fit: 'contain' })
  .png({ compressionLevel: 9 })
  .toFile(masterPath);

const featureBackground = Buffer.from(`
  <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${brand.canvas}"/>
        <stop offset="1" stop-color="#E8CD78"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${brand.navy}"/>
        <stop offset="1" stop-color="#235C78"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="${brand.navy}" flood-opacity="0.22"/>
      </filter>
    </defs>
    <rect width="1024" height="500" fill="url(#background)"/>
    <path d="M-50 465 L420 0 H585 L115 500 Z" fill="#FFF8DB" opacity="0.25"/>
    <path d="M700 500 L1024 175 V350 L870 500 Z" fill="#FCD66B" opacity="0.22"/>
    <path d="M18 378 C180 278 253 456 401 390 C557 320 699 430 1002 306" fill="none" stroke="${brand.navy}" stroke-width="7" stroke-linecap="round" stroke-dasharray="15 17" opacity="0.42"/>
    <g fill="${brand.yellow}" stroke="#fff7d6" stroke-width="3" filter="url(#shadow)">
      <circle cx="28" cy="371" r="10"/>
      <circle cx="1000" cy="307" r="10"/>
    </g>
    <text x="408" y="193" fill="${brand.navy}" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="800" letter-spacing="-3">BusSafe</text>
    <text x="408" y="285" fill="${brand.navy}" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="800" letter-spacing="-3">Alberta</text>
    <text x="412" y="344" fill="url(#accent)" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">Track the bus. Stay informed.</text>
  </svg>
`);

const featureMark = await sharp(masterPath)
  .resize(320, 320, { fit: 'contain' })
  .png({ compressionLevel: 9 })
  .toBuffer();

const densitySizes = {
  ldpi: 36,
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const renderMark = (size) =>
  sharp(masterSourcePath).resize(size, size, { fit: 'contain' }).png().toBuffer();

const writeCanvasIcon = async (size, outputPath, inset = 0.04) => {
  const markSize = Math.round(size * (1 - inset * 2));
  const mark = await renderMark(markSize);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: mark,
    left: Math.round((size - markSize) / 2),
    top: Math.round((size - markSize) / 2),
  }]).png({ compressionLevel: 9 }).toFile(outputPath);
};

const writeAdaptiveForeground = async (size, outputPath) => {
  const markSize = Math.round(size * 0.62);
  const mark = await sharp(busOnlySource).resize(markSize, markSize, { fit: 'contain' }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: mark,
    left: Math.round((size - markSize) / 2),
    top: Math.round((size - markSize) / 2),
  }]).png({ compressionLevel: 9 }).toFile(outputPath);
};

const writeSplashIcon = async (size, outputPath) => {
  const markSize = Math.round(size * 0.62);
  const mark = await renderMark(markSize);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: mark,
    left: Math.round((size - markSize) / 2),
    top: Math.round((size - markSize) / 2),
  }]).png({ compressionLevel: 9 }).toFile(outputPath);
};

const androidIconTasks = Object.entries(densitySizes).flatMap(([density, size]) => {
  const directory = path.join(androidResDirectory, `mipmap-${density}`);
  const foregroundSize = Math.round(size * 2.25);
  return [
    writeCanvasIcon(size, path.join(directory, 'ic_launcher.png')),
    writeCanvasIcon(size, path.join(directory, 'ic_launcher_round.png')),
    sharp({ create: { width: size, height: size, channels: 4, background: brand.navy } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(directory, 'ic_launcher_background.png')),
    writeAdaptiveForeground(foregroundSize, path.join(directory, 'ic_launcher_foreground.png')),
  ];
});

await Promise.all([
  sharp(masterPath)
    .png({ compressionLevel: 9 })
    .toFile(path.join(mobileDirectory, 'assets', 'logo.png')),
  sharp(masterPath)
    .resize(512, 512, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'app-icon-512.png')),
  sharp(masterSourcePath)
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDirectory, 'apple-touch-icon.png')),
  sharp(masterSourcePath)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDirectory, 'favicon.png')),
  sharp(masterSourcePath)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toFile(path.join(mobilePublicDirectory, 'favicon.png')),
  sharp(masterSourcePath)
    .resize(192, 192)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDirectory, 'icon-192.png')),
  sharp(masterSourcePath)
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDirectory, 'icon-512.png')),
  writeSplashIcon(
    432,
    path.join(androidResDirectory, 'drawable-nodpi', 'safebus_splash_icon.png'),
  ),
  sharp(featureBackground)
    .composite([{ input: featureMark, left: 48, top: 82 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(playDirectory, 'feature-graphic-1024x500.png')),
  ...androidIconTasks,
]);

console.log('Generated the official web, Android launcher, splash, and Play Store brand assets.');
