import { expect, test } from '@playwright/test';
import type { LibraryData } from '../../src/types';

const prefix = '/fe-fw/';

test('loads the published snapshot and keeps search links beneath the project path', async ({ page, request }) => {
  const remoteRequests: string[] = [];
  const errors: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4174' && url.pathname.startsWith(prefix)) return route.continue();
    remoteRequests.push(url.href);
    return route.abort();
  });
  page.on('pageerror', error => errors.push(error.message));
  const library = await (await request.get('generated/library.json')).json() as LibraryData;
  expect(library.guides).toHaveLength(library.sources.length);
  expect(library.guides.length).toBeGreaterThan(0);
  await page.goto('./');
  for (const guide of library.guides) {
    await expect(page.getByRole('link', { name: guide.title, exact: true })).toHaveAttribute('href', `${prefix}guides/${guide.id}`);
  }
  const guide = library.guides[0];
  const section = guide.sections.at(-1)!;
  await page.getByRole('searchbox').fill(section.heading);
  const match = page.locator('.passage-link').filter({ hasText: section.heading }).first();
  await expect(match).toHaveAttribute('href', `${prefix}guides/${guide.id}#${section.headingId}`);
  await match.click();
  await expect(page.locator(`[id="${section.headingId}"]`)).toBeFocused();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${prefix}$`));
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('each guide opens and reloads directly with its anchor on a static host', async ({ page, request }) => {
  const library = await (await request.get('generated/library.json')).json() as LibraryData;
  for (const guide of library.guides) {
    const heading = guide.headings.at(-1)!;
    const response = await page.goto(`guides/${guide.id}?from=bookmark#${heading.id}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(guide.title);
    await expect(page.locator(`[id="${heading.id}"]`)).toBeFocused();
    expect((await page.reload())?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(guide.topic);
    await expect(page.locator(`[id="${heading.id}"]`)).toBeFocused();
    await expect(page.locator('.article-content tbody tr').last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('unknown routes return a real 404 with a working link home', async ({ page }) => {
  expect((await page.goto('not-a-page'))?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to the library' }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
});

test('Pages output contains no raw captures or historical images', async ({ request }) => {
  for (const path of ['corpus/inventory.json', 'corpus/polygon-gifts/current.json', 'generated/assets/missing.png']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const library = await (await request.get('generated/library.json')).json() as LibraryData;
  for (const guide of library.guides) {
    expect(guide.warnings).toEqual([]);
    expect(guide.html).not.toMatch(/<img|<figure|image-unavailable/);
  }
});
