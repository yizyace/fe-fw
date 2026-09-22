import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { LibraryData } from '../src/types';
import { publicSnapshot, writePageRoutes } from '../scripts/pages';

const library: LibraryData = {
  sources: [{ id: 'test-guide', publisher: 'Example', topic: 'Gifts', url: 'https://example.org/guide', adapter: 'polygon' }],
  guides: [{ id: 'test-guide', title: 'Gifts — Example', topic: 'Gifts', publisher: 'Example', sourceUrl: 'https://example.org/guide', capturedAt: '2026-09-21', author: 'Original author', publishedAt: '2026-09-20', warnings: ['Private import details'], html: '<table><tbody><tr><th id="aster">Aster</th><td>Tea</td></tr></tbody></table>', text: 'Aster Tea', headings: [{ id: 'aster', text: 'Aster', level: 2 }], sections: [{ headingId: 'aster', heading: 'Aster', text: 'Aster Tea' }] }],
};
let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

it('exports only reader data while retaining attribution, content, and anchors', () => {
  const snapshot = publicSnapshot(library);
  expect(snapshot.guides[0]).toMatchObject({ html: library.guides[0].html, sourceUrl: library.guides[0].sourceUrl, sections: library.guides[0].sections, capturedAt: '2026-09-21', warnings: [] });
  expect(snapshot.guides[0]).not.toHaveProperty('author');
  expect(snapshot.guides[0]).not.toHaveProperty('publishedAt');
  expect(library.guides[0].warnings).toEqual(['Private import details']);
});

it('refuses incomplete snapshots, unsafe guide paths, and unexpected media', () => {
  expect(() => publicSnapshot({ ...library, guides: [] })).toThrow(/missing|complete/i);
  expect(() => publicSnapshot({ ...library, guides: [...library.guides, library.guides[0]] })).toThrow(/duplicate/i);
  const changed = (id: string, html: string) => ({ sources: [{ ...library.sources[0], id }], guides: [{ ...library.guides[0], id, html }] });
  expect(() => publicSnapshot(changed('../outside', library.guides[0].html))).toThrow(/id/i);
  expect(() => publicSnapshot(changed('test-guide', '<img src="https://example.org/private.png">'))).toThrow(/image|media/i);
});

it('writes static entry points for guide refreshes and unknown-path recovery', async () => {
  root = await mkdtemp(join(tmpdir(), 'pages-test-'));
  await mkdir(join(root, 'assets'));
  const html = '<html><script type="module" src="/fe-fw/assets/app.js"></script></html>';
  await writeFile(join(root, 'index.html'), html);
  await writePageRoutes(root, library);
  expect(await readFile(join(root, 'guides/test-guide/index.html'), 'utf8')).toBe(html);
  expect(await readFile(join(root, '404.html'), 'utf8')).toBe(html);
  expect(await readFile(join(root, '.nojekyll'), 'utf8')).toBe('');
});
