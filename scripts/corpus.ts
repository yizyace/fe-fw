import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { load } from 'cheerio';
import { chromium } from '@playwright/test';
import type { AssetRecord, CaptureManifest, LibraryData, ReaderGuide, SourceDefinition } from '../src/types';
import { bodySelectors, EXTRACTION_VERSION, extractArticle, indexContent, localizeImages, sanitizeArticle } from './extract';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (data: unknown) => JSON.stringify(data, null, 2) + '\n';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const safeId = (id: string) => /^[a-z0-9][a-z0-9-]*$/i.test(id);
const assetPath = (path: string) => /^assets\/[a-f0-9]{64}\.(png|jpg|gif|webp|avif)$/.test(path);
async function optionalJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, json(data)); await rename(temp, path);
}
export async function readSources(root: string): Promise<SourceDefinition[]> {
  const sources = JSON.parse(await readFile(join(root, 'sources.json'), 'utf8')) as SourceDefinition[];
  const seen = new Set<string>();
  if (!Array.isArray(sources)) throw Error('sources.json must be an array');
  for (const source of sources) {
    if (!safeId(source.id) || seen.has(source.id) || !source.publisher || !source.topic || !Object.hasOwn(bodySelectors, source.adapter) || !/^https?:$/.test(new URL(source.url).protocol)) throw Error(`Invalid or duplicate source: ${source.id}`);
    seen.add(source.id);
  }
  return sources;
}

interface CaptureOptions { root: string; browser?: boolean; htmlPath?: string }
async function acquire(source: SourceDefinition, options: CaptureOptions) {
  if (options.htmlPath) return { raw: await readFile(resolve(options.htmlPath)), finalUrl: source.url, method: 'html' as const, status: null };
  if (options.browser) {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (response?.ok()) await page.locator(bodySelectors[source.adapter]).first().waitFor({ timeout: 15000 }).catch(() => {});
      return { raw: Buffer.from(await page.content()), finalUrl: page.url(), method: 'browser' as const, status: response?.status() ?? 0 };
    } finally { await browser.close(); }
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  return { raw: Buffer.from(await response.arrayBuffer()), finalUrl: response.url, method: 'fetch' as const, status: response.status };
}

function imageExtension(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString())) return 'avif';
}
async function downloadAsset(root: string, url: string): Promise<AssetRecord> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const extension = imageExtension(bytes);
    if (!extension || bytes.length > 20 * 1024 * 1024) throw Error('Unsupported or oversized image (raster images up to 20 MB only)');
    const sha256 = hash(bytes); const path = `assets/${sha256}.${extension}`;
    await mkdir(join(root, 'corpus/assets'), { recursive: true });
    await writeFile(join(root, 'corpus', path), bytes);
    return { url, finalUrl: response.url, path, sha256, mediaType: response.headers.get('content-type') || `image/${extension}` };
  } catch (error) { return { url, error: errorMessage(error) }; }
}

export async function captureSource(source: SourceDefinition, options: CaptureOptions): Promise<CaptureManifest> {
  if (!safeId(source.id)) throw Error('Unsafe source ID');
  const capturedAt = new Date().toISOString();
  const captureId = `${capturedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const folder = join(options.root, 'corpus', source.id, 'captures', captureId);
  await mkdir(folder, { recursive: true });
  let capture: Awaited<ReturnType<typeof acquire>> | undefined;
  try {
    capture = await acquire(source, options);
    await writeFile(join(folder, 'raw.html'), capture.raw);
    if (capture.status !== null && (capture.status < 200 || capture.status >= 300)) throw Error(`HTTP ${capture.status}`);
    const extracted = extractArticle(source, capture.raw.toString('utf8'), capture.finalUrl);
    const imageUrls = [...new Set(load(extracted.html)('img').map((_, e) => e.attribs.src).get())];
    const assets: AssetRecord[] = [];
    for (let i = 0; i < imageUrls.length; i += 6) assets.push(...await Promise.all(imageUrls.slice(i, i + 6).map(url => downloadAsset(options.root, url))));
    const warnings = [...extracted.warnings, ...assets.filter(a => a.error).map(a => `Image unavailable: ${a.url} (${a.error})`)];
    if (options.htmlPath) warnings.push('Imported operator-supplied HTML; original response status and final URL could not be independently verified.');
    const html = localizeImages(extracted.html, assets);
    const guide: ReaderGuide = { ...extracted, ...indexContent(html, extracted.title), id: source.id, publisher: source.publisher, topic: source.topic, sourceUrl: capture.finalUrl, capturedAt, html, warnings };
    const guideBytes = json(guide);
    const manifest: CaptureManifest = { schemaVersion: 1, source, captureId, requestedUrl: source.url, finalUrl: capture.finalUrl, capturedAt, method: capture.method, ...(options.htmlPath ? { inputPath: resolve(options.htmlPath) } : {}), status: capture.status, extractionVersion: EXTRACTION_VERSION, rawSha256: hash(capture.raw), guideSha256: hash(guideBytes), assets, warnings };
    await writeFile(join(folder, 'guide.json'), guideBytes);
    await writeJson(join(folder, 'manifest.json'), manifest);
    // A capture must pass the same checks as an offline build before promotion.
    await readCapture(options.root, source.id, captureId);
    await writeJson(join(options.root, 'corpus', source.id, 'current.json'), { captureId });
    return manifest;
  } catch (error) {
    // Failed attempts must not appear as successful historical captures.
    await rm(join(folder, 'manifest.json'), { force: true });
    await writeJson(join(folder, 'attempt.json'), { source, captureId, capturedAt, method: capture?.method ?? (options.browser ? 'browser' : options.htmlPath ? 'html' : 'fetch'), requestedUrl: source.url, finalUrl: capture?.finalUrl, status: capture?.status, rawSha256: capture ? hash(capture.raw) : undefined, error: errorMessage(error) });
    throw error;
  }
}

async function readCapture(root: string, sourceId: string, captureId: string) {
  if (!safeId(sourceId) || !safeId(captureId)) throw Error('Invalid capture path');
  const folder = join(root, 'corpus', sourceId, 'captures', captureId);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as CaptureManifest;
  const [raw, guideBytes] = await Promise.all([readFile(join(folder, 'raw.html')), readFile(join(folder, 'guide.json'))]);
  if (manifest.schemaVersion !== 1 || manifest.source.id !== sourceId || manifest.captureId !== captureId || !manifest.extractionVersion || !Number.isFinite(Date.parse(manifest.capturedAt)) || !['fetch', 'browser', 'html'].includes(manifest.method)) throw Error(`Invalid provenance: ${sourceId}/${captureId}`);
  if (hash(raw) !== manifest.rawSha256 || hash(guideBytes) !== manifest.guideSha256) throw Error(`Content hash mismatch: ${sourceId}/${captureId}`);
  const guide = JSON.parse(guideBytes.toString()) as ReaderGuide;
  if (guide.id !== sourceId || guide.sourceUrl !== manifest.finalUrl || guide.capturedAt !== manifest.capturedAt || manifest.requestedUrl !== manifest.source.url || guide.publisher !== manifest.source.publisher) throw Error(`Guide provenance mismatch: ${sourceId}`);
  if (load(sanitizeArticle(guide.html), null, false).html() !== load(guide.html, null, false).html()) throw Error(`Unsafe guide HTML: ${sourceId}`);
  const issues = inspectLinks(guide, new Set(manifest.assets.flatMap(a => a.path ? [`/generated/${a.path}`] : [])));
  if (issues.length) throw Error(issues.join('; '));
  for (const asset of manifest.assets) {
    if (asset.error && !asset.path) continue;
    if (!asset.path || !assetPath(asset.path) || !asset.sha256) throw Error(`Invalid asset manifest: ${sourceId}`);
    const bytes = await readFile(join(root, 'corpus', asset.path));
    if (hash(bytes) !== asset.sha256 || !imageExtension(bytes)) throw Error(`Asset hash mismatch: ${asset.path}`);
  }
  return { manifest, guide };
}

function inspectLinks(guide: ReaderGuide, assets: Set<string>): string[] {
  const $ = load(guide.html); const errors: string[] = []; const ids = new Set<string>();
  $('[id]').each((_, e) => { const id = $(e).attr('id')!; if (ids.has(id)) errors.push(`Duplicate anchor: ${id}`); ids.add(id); });
  for (const heading of guide.headings) if (!ids.has(heading.id)) errors.push(`Missing heading: ${heading.id}`);
  $('img').each((_, e) => { if (!assets.has($(e).attr('src') || '')) errors.push(`Nonlocal or missing image: ${$(e).attr('src')}`); });
  $('a[href]').each((_, e) => {
    const href = $(e).attr('href')!;
    if (href.startsWith('#')) { if (!ids.has(href.slice(1))) errors.push(`Broken anchor: ${href}`); }
    else if (!/^https?:\/\/|^mailto:|^\/guides\//.test(href)) errors.push(`Invalid link: ${href}`);
  });
  return errors;
}

async function collectLibrary(root: string) {
  const sources = await readSources(root); const guides: ReaderGuide[] = []; const manifests: CaptureManifest[] = [];
  for (const source of sources) {
    const current = await optionalJson<{ captureId: string }>(join(root, 'corpus', source.id, 'current.json'));
    if (!current) continue;
    const { manifest, guide } = await readCapture(root, source.id, current.captureId);
    guides.push({ ...guide, ...indexContent(guide.html, guide.title) }); manifests.push(manifest);
  }
  // Links to captured articles stay local. Other source links remain explicitly external.
  const localUrls = new Map(manifests.flatMap(m => [[m.requestedUrl.replace(/\/$/, ''), m.source.id], [m.finalUrl.replace(/\/$/, ''), m.source.id]]));
  for (const guide of guides) {
    const $ = load(guide.html, null, false);
    $('a[href]').each((_, e) => {
      const href = $(e).attr('href')!;
      if (!/^https?:/.test(href)) return;
      const url = new URL(href); if (url.hash || url.search) return;
      const id = localUrls.get(url.href.replace(/\/$/, '')); if (id) $(e).attr('href', `/guides/${id}`);
    });
    guide.html = $.html();
  }
  return { library: { guides, sources } satisfies LibraryData, manifests };
}

export async function writeInventory(root: string) {
  const inventory: { sourceId: string; captureId: string; current: boolean; files: string[]; manifest?: CaptureManifest; attempt?: unknown }[] = [];
  const folders = await readdir(join(root, 'corpus'), { withFileTypes: true }).catch(() => []);
  for (const folder of folders.filter(f => f.isDirectory() && safeId(f.name))) {
    const current = await optionalJson<{ captureId: string }>(join(root, 'corpus', folder.name, 'current.json'));
    const captures = await readdir(join(root, 'corpus', folder.name, 'captures')).catch(() => []);
    for (const captureId of captures.filter(safeId).sort()) {
      const path = join(root, 'corpus', folder.name, 'captures', captureId);
      const manifest = await optionalJson<CaptureManifest>(join(path, 'manifest.json'));
      inventory.push({ sourceId: folder.name, captureId, current: current?.captureId === captureId, files: [...(await readdir(path)).map(f => `${folder.name}/captures/${captureId}/${f}`), ...(manifest?.assets.flatMap(a => a.path ? [a.path] : []) ?? [])], manifest, attempt: await optionalJson(join(path, 'attempt.json')) });
    }
  }
  await writeJson(join(root, 'corpus/inventory.json'), inventory);
  return inventory;
}

export async function buildLibrary(root: string): Promise<LibraryData> {
  const { library, manifests } = await collectLibrary(root);
  const stage = join(root, 'public', `.generated-${randomUUID()}`); const target = join(root, 'public/generated'); const backup = `${stage}-previous`;
  await mkdir(join(stage, 'assets'), { recursive: true });
  try {
    for (const asset of manifests.flatMap(m => m.assets)) if (asset.path) await copyFile(join(root, 'corpus', asset.path), join(stage, asset.path));
    await writeJson(join(stage, 'library.json'), library);
    let hadPrevious = false;
    try { await rename(target, backup); hadPrevious = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename(stage, target); } catch (error) { if (hadPrevious) await rename(backup, target); throw error; }
    await rm(backup, { recursive: true, force: true });
  } finally { await rm(stage, { recursive: true, force: true }); }
  await writeInventory(root);
  return library;
}

export async function verifyCorpus(root: string): Promise<string[]> {
  const errors: string[] = [];
  try {
    const inventory = await writeInventory(root);
    for (const entry of inventory) if (entry.manifest) {
      try { await readCapture(root, entry.sourceId, entry.captureId); } catch (error) { errors.push(errorMessage(error)); }
    }
    const { library, manifests } = await collectLibrary(root);
    const generated = await readFile(join(root, 'public/generated/library.json'), 'utf8');
    if (generated !== json(library)) errors.push('Generated library is stale; run pnpm guides:build');
    for (const asset of manifests.flatMap(m => m.assets)) if (asset.path) {
      try { if (hash(await readFile(join(root, 'public/generated', asset.path))) !== asset.sha256) errors.push(`Generated asset hash mismatch: ${asset.path}`); }
      catch { errors.push(`Missing generated asset: ${asset.path}`); }
    }
  } catch (error) { errors.push(errorMessage(error)); }
  return errors;
}
