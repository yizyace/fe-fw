import { expect, test as base, type Page } from '@playwright/test';
import type { LibraryData, ReaderGuide } from '../../src/types';

const guide: ReaderGuide = {
  id: 'beginner-guide', title: 'A beginner’s guide to Fortune’s Weave', publisher: 'Polygon', topic: 'Getting started',
  author: 'Guide author', publishedAt: '2026-09-20T00:00:00Z', capturedAt: '2026-09-21T00:00:00Z', sourceUrl: 'https://example.com/guide',
  text: 'Explore the monastery. Share a meal to build support. Moonstones unlock advanced classes.',
  html: '<p>Explore the monastery.</p><h2 id="support">Building support</h2><p>Share a meal to build support.</p><h2 id="classes">Advanced classes</h2><p>Moonstones unlock advanced classes.</p><div class="table-scroll" role="region" aria-label="Class requirements" tabindex="0"><table><caption>Class requirements</caption><thead><tr><th scope="col">Class</th><th scope="col">Skill</th><th scope="col">Weapon</th><th scope="col">Requirement</th></tr></thead><tbody><tr><td>Sky Knight</td><td>Flying</td><td>Lance</td><td>Moonstone</td></tr></tbody></table></div>',
  headings: [{ id: 'support', text: 'Building support', level: 2 }, { id: 'classes', text: 'Advanced classes', level: 2 }],
  sections: [{ headingId: 'support', heading: 'Building support', text: 'Share a meal to build support.' }, { headingId: 'classes', heading: 'Advanced classes', text: 'Moonstones unlock advanced classes.' }], warnings: [],
};
const fixture: LibraryData = {
  guides: [guide, { ...guide, id: 'other-guide', title: 'Preparing for battle', publisher: 'Dork', text: 'Take time to organize your inventory.', html: '<p>Take time to organize your inventory.</p>', headings: [], sections: [] }],
  sources: [{ id: 'beginner-guide', url: 'https://example.com/guide', publisher: 'Polygon', topic: 'Getting started', adapter: 'polygon' }],
};

async function libraryFixture(page: Page, data: LibraryData = fixture) {
  await page.route('**/generated/library.json', route => route.fulfill({ json: data }));
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

// Allow only the preview server. A test also fails if the reader tries to phone home.
const test = base.extend<{ offlineAudit: void }>({
  offlineAudit: [async ({ context, page }, use) => {
    const remoteRequests: string[] = [];
    const errors: string[] = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:4173') return route.continue();
      remoteRequests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(remoteRequests, 'reader must not request external resources').toEqual([]);
    expect(errors, 'browser runtime errors').toEqual([]);
  }, { auto: true }],
});

test('empty checkout explains how to import its configured sources', async ({ page }) => {
  await libraryFixture(page, { guides: [], sources: fixture.sources });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your shelf is ready.' })).toBeVisible();
  await expect(page.getByText('pnpm guides:import all', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Getting started' })).toHaveAttribute('href', fixture.sources[0].url);
  await expectNoOverflow(page);
});

test('unknown guides and routes give a way back to the library', async ({ page }) => {
  await libraryFixture(page);
  await page.goto('/guides/not-saved');
  await expect(page.getByRole('heading', { name: 'Guide not found.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Guide not found.' })).toBeFocused();
  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(page.getByLabel('Search guides')).toBeVisible();
  await page.goto('/not-a-page');
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeFocused();
  await page.getByRole('link', { name: 'Return to the library' }).click();
  await expect(page.getByLabel('Search guides')).toBeVisible();
});

for (const failure of ['unavailable', 'invalid'] as const) {
  test(`local library ${failure} state explains recovery`, async ({ page }) => {
    await page.route('**/generated/library.json', route => failure === 'unavailable'
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ json: { guides: null, sources: null } }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Couldn’t open your library.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Couldn’t open your library.' })).toBeFocused();
    await expect(page.getByText('pnpm guides:build', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload library' })).toBeVisible();
    await expectNoOverflow(page);
  });
}

test('search keeps publishers separate and opens matching sections by keyboard', async ({ page }) => {
  await libraryFixture(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Polygon guides' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dork guides' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search guides' });
  await search.fill('PREPARING');
  await expect(page.getByRole('link', { name: 'Preparing for battle' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1 guide matches');
  await search.fill('MOONSTONES');
  const passage = page.getByRole('link', { name: 'Advanced classes Moonstones unlock advanced classes.' });
  await expect(passage).toBeVisible();
  await passage.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/guides/beginner-guide#classes');
  await expect(page.getByRole('heading', { name: 'Advanced classes' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(guide.title);
  await expect(page.getByText('Guide author', { exact: true })).toBeVisible();
  await expect(page.getByText('September 20, 2026', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read at Polygon' })).toHaveAttribute('href', guide.sourceUrl);
  await expectNoOverflow(page);
});

test('empty search results recover through the clear button', async ({ page }) => {
  await libraryFixture(page);
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search guides' });
  await search.fill('unfindable phrase');
  await expect(page.getByRole('heading', { name: 'No matching passages.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.getByRole('region', { name: 'Polygon guides' })).toBeVisible();
});

test('skip link, heading index and wide table work with a keyboard', async ({ page }, testInfo) => {
  await libraryFixture(page);
  await page.goto('/guides/beginner-guide');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  if (testInfo.project.name.startsWith('narrow')) {
    const summary = page.locator('.mobile-index summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.mobile-index')).toHaveAttribute('open', '');
  }
  const index = page.getByRole('navigation', { name: 'Guide sections' });
  const link = index.getByRole('link', { name: 'Building support' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Building support' })).toBeFocused();
  const tableRegion = page.getByRole('region', { name: 'Class requirements' });
  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();
  await expect(page.getByRole('table')).not.toHaveAttribute('tabindex');
  await expect(page.getByRole('table')).toHaveCSS('display', 'table');
  if (testInfo.project.name.startsWith('narrow')) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  await expect(page.getByRole('cell', { name: 'Moonstone', exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

test('search has readable text, a distinct field boundary and a visible focus indicator', async ({ page }) => {
  await libraryFixture(page);
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search guides' });
  await expect(search).toBeVisible();
  const contrast = await page.evaluate(() => {
    const control = getComputedStyle(document.querySelector('.search-control')!);
    const field = getComputedStyle(document.querySelector('input')!);
    const root = getComputedStyle(document.documentElement);
    const luminance = (color: string) => {
      const rgb = color.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const ratio = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    return {
      text: ratio(field.color, control.backgroundColor),
      border: ratio(control.borderTopColor, root.backgroundColor),
    };
  });
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);
  expect(contrast.border).toBeGreaterThanOrEqual(3);
  await search.focus();
  await expect(page.locator('.search-control')).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.search-control')).toHaveCSS('outline-width', '2px');
});

test('every saved guide renders locally with readable tables and decoded cached images', async ({ page, request }) => {
  const response = await request.get('/generated/library.json');
  expect(response.ok()).toBe(true);
  const library = await response.json() as LibraryData;
  test.skip(library.guides.length === 0, 'No local captures; synthetic reader coverage still runs.');
  for (const saved of library.guides) {
    await test.step(saved.id, async () => {
      await page.goto(`/guides/${encodeURIComponent(saved.id)}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(saved.title);
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      const expected = await page.evaluate(html => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return {
          cells: [...document.querySelectorAll('td, th')].map(cell => cell.textContent?.trim()),
          images: document.querySelectorAll('img').length,
        };
      }, saved.html);
      for (const heading of saved.headings) {
        expect(await page.evaluate(id => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim(), heading.id)).toBe(heading.text);
      }
      expect(await page.locator('.article-content td, .article-content th').evaluateAll(cells => cells.map(cell => cell.textContent?.trim()))).toEqual(expected.cells);
      await expect(page.locator('.article-content img')).toHaveCount(expected.images);
      const images = await page.locator('.article-content img').evaluateAll(async elements => Promise.all(elements.map(async element => {
        const image = element as HTMLImageElement;
        image.loading = 'eager';
        let decoded = true;
        try { await image.decode(); } catch { decoded = false; }
        return { source: new URL(image.currentSrc || image.src).pathname, decoded, width: image.naturalWidth, hasAlt: image.hasAttribute('alt') };
      })));
      for (const image of images) {
        expect(image.source).toMatch(/^\/generated\/assets\//);
        expect(image.decoded, image.source).toBe(true);
        expect(image.width, image.source).toBeGreaterThan(0);
        expect(image.hasAlt, image.source).toBe(true);
      }
      await expectNoOverflow(page);
    });
  }
});
