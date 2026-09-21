import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CaptureManifest, ReaderGuide, SourceDefinition } from '../src/types';
import { buildLibrary, captureSource, verifyCorpus } from '../scripts/corpus';
import { searchGuides } from '../src/search';

let root: string;
let server: Server;
let source: SourceDefinition;
let fail = false;
let requests: string[];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const article = (table = '<table><tr><th>Character</th><th>Likes</th><th>Gifts</th></tr><tr><td>Hero</td><td>Quiet mornings</td><td>Flowers (except red ones)</td></tr></table>') => `<title>Original gift article</title><h1>Original gift article</h1><div class="article-body"><p>Editorial introduction with sufficient context for reading the original article and the gift list below while offline.</p><h2>Best gifts</h2>${table}<figure><img src="/image.png" alt="Flower"><figcaption>Photo credit</figcaption></figure></div>`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'guide-test-'));
  fail = false;
  requests = [];
  server = createServer((req, res) => {
    requests.push(req.url!);
    if (req.url === '/image.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); return; }
    if (fail) { res.writeHead(503); res.end('Unavailable'); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(article());
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('server');
  source = { id: 'fixture', url: `http://127.0.0.1:${address.port}/guide`, publisher: 'Polygon', topic: 'Gifts', adapter: 'polygon' };
  await writeFile(join(root, 'sources.json'), JSON.stringify([source]));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

it('retains the last working capture when a refresh fails and keeps previous successes', async () => {
  const first = await captureSource(source, { root });
  const second = await captureSource(source, { root });
  expect(second.captureId).not.toBe(first.captureId);
  fail = true;
  await expect(captureSource(source, { root })).rejects.toThrow(/503/);
  expect(JSON.parse(await readFile(join(root, 'corpus/fixture/current.json'), 'utf8')).captureId).toBe(second.captureId);
  expect(await readdir(join(root, 'corpus/fixture/captures'))).toContain(first.captureId);
  expect((await buildLibrary(root)).guides[0].text).toContain('Flowers (except red ones)');
});

it('imports without requesting images and generates only reference data offline', async () => {
  const manifest = await captureSource(source, { root });
  expect(requests).toEqual(['/guide']);
  expect(manifest.assets).toEqual([]);
  vi.stubGlobal('fetch', () => { throw Error('Network forbidden'); });
  const library = await buildLibrary(root);
  const guide = library.guides[0];
  expect(guide.title).toBe('Gifts — Polygon');
  expect(guide.html).not.toMatch(/<img|Photo credit|Editorial introduction|Quiet mornings|Original gift article|Image unavailable/);
  expect(searchGuides(library.guides, 'Editorial introduction')).toEqual([]);
  expect(searchGuides(library.guides, 'except red ones')[0].matches[0].headingId).not.toBe('');
  expect(await readdir(join(root, 'public/generated'))).toEqual(['library.json']);
  expect(await verifyCorpus(root)).toEqual([]);
  const saved = JSON.parse(await readFile(join(root, 'corpus/fixture/captures', manifest.captureId, 'guide.json'), 'utf8')) as ReaderGuide;
  expect(saved.title).toBe('Original gift article');
  await writeFile(join(root, 'corpus/fixture/captures', manifest.captureId, 'raw.html'), 'tampered');
  await expect(buildLibrary(root)).rejects.toThrow(/hash/i);
});

it('preserves historical capture bytes and still verifies historical image hashes', async () => {
  const manifest = await captureSource(source, { root });
  const folder = join(root, 'corpus/fixture/captures', manifest.captureId);
  // Turn this synthetic capture into the previous image-caching format.
  const asset = { url: `${source.url}/image.png`, path: `assets/${hash(png)}.png`, sha256: hash(png), mediaType: 'image/png' };
  await mkdir(join(root, 'corpus/assets'), { recursive: true });
  await writeFile(join(root, 'corpus', asset.path), png);
  const guide = JSON.parse(await readFile(join(folder, 'guide.json'), 'utf8')) as ReaderGuide;
  guide.html += `<img src="/generated/${asset.path}" alt="Historical image">`;
  const guideBytes = JSON.stringify(guide);
  const historical: CaptureManifest = { ...manifest, extractionVersion: '3', assets: [asset], guideSha256: hash(guideBytes) };
  const manifestBytes = JSON.stringify(historical);
  await writeFile(join(folder, 'guide.json'), guideBytes);
  await writeFile(join(folder, 'manifest.json'), manifestBytes);
  await buildLibrary(root);
  expect(await verifyCorpus(root)).toEqual([]);
  expect(await readFile(join(folder, 'guide.json'), 'utf8')).toBe(guideBytes);
  expect(await readFile(join(folder, 'manifest.json'), 'utf8')).toBe(manifestBytes);
  expect(await readFile(join(root, 'corpus', asset.path))).toEqual(png);
  expect(await readdir(join(root, 'public/generated'))).toEqual(['library.json']);
  await writeFile(join(root, 'corpus', asset.path), 'tampered');
  expect((await verifyCorpus(root)).join(' ')).toMatch(/Asset hash mismatch/);
});

it('generates an empty library for a fresh checkout', async () => {
  expect((await buildLibrary(root)).guides).toEqual([]);
  expect(await verifyCorpus(root)).toEqual([]);
});

it('retains the working capture and generated library when reference normalization fails', async () => {
  const previous = await captureSource(source, { root });
  await buildLibrary(root);
  const generated = await readFile(join(root, 'public/generated/library.json'), 'utf8');
  const htmlPath = join(root, 'input.html');
  const html = article('<table><tr><th>Unexpected structure</th></tr><tr><td>Not a gift list</td></tr></table>');
  await writeFile(htmlPath, html);
  await expect(captureSource(source, { root, htmlPath })).rejects.toThrow(/reference|gift|column|table/i);
  expect(JSON.parse(await readFile(join(root, 'corpus/fixture/current.json'), 'utf8')).captureId).toBe(previous.captureId);
  const captures = await readdir(join(root, 'corpus/fixture/captures'));
  const failed = captures.find(id => id !== previous.captureId)!;
  const folder = join(root, 'corpus/fixture/captures', failed);
  expect(JSON.parse(await readFile(join(folder, 'attempt.json'), 'utf8')).error).toMatch(/reference|gift|column|table/i);
  expect(await readFile(join(folder, 'raw.html'), 'utf8')).toBe(html);
  await expect(readFile(join(folder, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(root, 'public/generated/library.json'), 'utf8')).toBe(generated);
  expect(await verifyCorpus(root)).toEqual([]);
});

it('supplied HTML never fetches images and retains its provenance warning only in capture metadata', async () => {
  const htmlPath = join(root, 'input.html');
  await writeFile(htmlPath, article());
  vi.stubGlobal('fetch', () => { throw Error('Network forbidden'); });
  const manifest = await captureSource(source, { root, htmlPath });
  expect(manifest.method).toBe('html');
  expect(manifest.warnings.join(' ')).toContain('operator-supplied HTML');
  expect(manifest.assets).toEqual([]);
  const guide = (await buildLibrary(root)).guides[0];
  expect(guide.html).not.toContain('Image unavailable');
  expect(await verifyCorpus(root)).toEqual([]);
});

it('browser imports block image downloads', async () => {
  const manifest = await captureSource(source, { root, browser: true });
  expect(manifest.method).toBe('browser');
  expect(requests).toContain('/guide');
  expect(requests).not.toContain('/image.png');
  expect(manifest.assets).toEqual([]);
});

it('retains the working capture when sanitized source anchors are broken', async () => {
  const previous = await captureSource(source, { root });
  const htmlPath = join(root, 'input.html');
  await writeFile(htmlPath, article().replace('</div>', '<a href="#removed">Details</a><mark id="removed">Updated details</mark></div>'));
  await expect(captureSource(source, { root, htmlPath })).rejects.toThrow(/Broken anchor/);
  expect(JSON.parse(await readFile(join(root, 'corpus/fixture/current.json'), 'utf8')).captureId).toBe(previous.captureId);
  await buildLibrary(root);
  expect(await verifyCorpus(root)).toEqual([]);
});
