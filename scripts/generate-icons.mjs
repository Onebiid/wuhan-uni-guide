import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/icon-source.svg', import.meta.url));
const outputs = [
  { size: 512, path: fileURLToPath(new URL('../public/icon-512.png', import.meta.url)) },
  { size: 192, path: fileURLToPath(new URL('../public/icon-192.png', import.meta.url)) },
  { size: 180, path: fileURLToPath(new URL('../public/apple-touch-icon.png', import.meta.url)) },
];

await Promise.all(outputs.map(({ size, path }) => sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(path)));
