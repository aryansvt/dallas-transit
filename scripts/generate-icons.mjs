// Reuses Next's existing sharp dependency; no new package.
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
const web = createRequire(new URL('../apps/web/package.json', import.meta.url));
const next = createRequire(web.resolve('next/package.json'));
const sharp = next('sharp');
const directory = new URL('../apps/web/public/icons/', import.meta.url);
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['maskable-512', 512],
  ['apple-touch-icon', 180],
]) {
  await sharp(fileURLToPath(new URL('source.svg', directory)))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`${name}.png`, directory)));
}
