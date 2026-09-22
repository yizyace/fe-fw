import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { load } from 'cheerio';
import type { LibraryData } from '../src/types';
import { buildLibrary, verifyCorpus } from './corpus';

// Publish only the reference view; capture manifests, warnings, and raw sources stay local.
export function publicSnapshot(library: LibraryData): LibraryData {
  const ids = new Set<string>();
  for (const guide of library.guides) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(guide.id)) throw Error(`Invalid guide ID: ${guide.id}`);
    if (ids.has(guide.id)) throw Error(`Duplicate guide: ${guide.id}`);
    if (load(guide.html)('img, figure, figcaption, .image-unavailable').length) throw Error(`Unexpected media: ${guide.id}`);
    ids.add(guide.id);
  }
  if (!ids.size || ids.size !== library.sources.length || library.sources.some(source => !ids.has(source.id))) throw Error('A complete snapshot of every registered guide is required');
  return {
    sources: library.sources,
    guides: library.guides.map(guide => ({
      id: guide.id, title: guide.title, publisher: guide.publisher, topic: guide.topic,
      sourceUrl: guide.sourceUrl, capturedAt: guide.capturedAt, html: guide.html,
      text: guide.text, headings: guide.headings, sections: guide.sections, warnings: [],
    })),
  };
}

export async function writePageRoutes(outDir: string, library: LibraryData) {
  for (const guide of library.guides) {
    const directory = join(outDir, 'guides', guide.id);
    await mkdir(directory, { recursive: true });
    await copyFile(join(outDir, 'index.html'), join(directory, 'index.html'));
  }
  await copyFile(join(outDir, 'index.html'), join(outDir, '404.html'));
  await writeFile(join(outDir, '.nojekyll'), '');
}

async function main() {
  const root = process.cwd();
  const snapshotPath = join(root, 'reference/library.json');
  if (process.argv[2] === 'snapshot') {
    const library = await buildLibrary(root);
    const errors = await verifyCorpus(root);
    if (errors.length) throw Error(errors.join('\n'));
    const snapshot = publicSnapshot(library);
    await mkdir(join(root, 'reference'), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`Exported ${snapshot.guides.length} public references. Review reference/library.json before committing.`);
  } else if (process.argv[2] === 'build') {
    const library = publicSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')) as LibraryData);
    const publicDir = await mkdtemp(join(tmpdir(), 'fe-fw-pages-'));
    try {
      await mkdir(join(publicDir, 'generated'));
      await writeFile(join(publicDir, 'generated/library.json'), JSON.stringify(library) + '\n');
      // A separate public directory prevents local captures/assets entering a Pages release.
      await build({ root, base: process.env.PAGES_BASE_PATH || '/fe-fw/', publicDir });
      await writePageRoutes(join(root, 'dist'), library);
    } finally { await rm(publicDir, { recursive: true, force: true }); }
  } else throw Error('Usage: tsx scripts/pages.ts <snapshot|build>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
