// Génère les icônes PNG pour la PWA à partir de public/icon.svg
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, '..');
const svg   = readFileSync(join(root, 'public', 'icon.svg'));

const sizes = [
  { size: 192,  file: 'icon-192.png' },
  { size: 512,  file: 'icon-512.png' },
  { size: 180,  file: 'apple-touch-icon.png' },
];

for (const { size, file } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', file));
  console.log(`✓ public/${file} (${size}×${size})`);
}
console.log('Done.');
