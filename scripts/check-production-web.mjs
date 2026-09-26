// Run against a local `next start` using inert build fixtures, never live providers.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
const { fetch } = globalThis;

const origin = 'http://127.0.0.1:3010';
const response = await fetch(origin);
assert.equal(response.status, 200);
const html = await response.text();
const policy = response.headers.get('content-security-policy');
assert(policy);
const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
assert(nonce);
assert(html.includes(`nonce="${nonce}"`));
assert.match(response.headers.get('cache-control'), /no-store/);
assert.equal(response.headers.get('x-frame-options'), 'DENY');
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
const second = await fetch(origin, {
  headers: { 'content-security-policy': "script-src 'nonce-attacker'" },
});
assert.notEqual(second.headers.get('content-security-policy'), policy);
assert(!second.headers.get('content-security-policy').includes('attacker'));
for (const path of [
  '/about',
  '/privacy',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
]) {
  assert.equal((await fetch(`${origin}${path}`)).status, 200, path);
}
assert.equal((await fetch(`${origin}/preview`)).status, 404);
const failure = await fetch(
  `${origin}/api/v1/places/search?q=station&serviceDate=2026-09-25`,
);
assert.equal(failure.status, 503);
assert.deepEqual(await failure.json(), {
  error: { code: 'SERVICE_UNAVAILABLE' },
});
assert.match(failure.headers.get('cache-control'), /no-store/);
assert.equal((await fetch(`${origin}/api/v1/health`)).status, 404);

const chunks = new URL('../apps/web/.next/static/chunks/', import.meta.url);
const entries = (await readdir(chunks)).filter((name) => name.endsWith('.js'));
let allBytes = 0;
let allGzip = 0;
let initialBytes = 0;
let initialGzip = 0;
for (const name of entries) {
  const bytes = await readFile(new URL(name, chunks));
  const source = bytes.toString();
  assert(
    !/TRANSIT_PROXY_KEY|GEOAPIFY_API_KEY|DATABASE_URL|api\.example\.invalid|build-fixture-placeholder-not-a-secret|PreviewWorkspace|previewResponse/.test(
      source,
    ),
    name,
  );
  assert(!/serviceWorker\.register|caches\.open/.test(source), name);
  allBytes += bytes.length;
  allGzip += gzipSync(bytes).length;
  if (html.includes(`/_next/static/chunks/${name}`)) {
    initialBytes += bytes.length;
    initialGzip += gzipSync(bytes).length;
  }
}
// Source-level palette calculations complement component focus/keyboard tests.
const luminance = (hex) => {
  const rgb = hex
    .match(/[0-9a-f]{2}/g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
const ratios = [
  ['192c3c', 'f6f5f0'],
  ['56616a', 'f6f5f0'],
  ['825515', 'f6f5f0'],
  ['ffffff', '192c3c'],
].map(([a, b]) => ({
  colors: `${a}/${b}`,
  ratio: Number(contrast(a, b).toFixed(2)),
}));
for (const { ratio } of ratios) assert(ratio >= 4.5);
globalThis.console.log(
  JSON.stringify(
    {
      checks: 'passed',
      chunks: entries.length,
      allBytes,
      allGzip,
      initialBytes,
      initialGzip,
      contrast: ratios,
      source: fileURLToPath(chunks),
    },
    null,
    2,
  ),
);
