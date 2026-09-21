import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { normalizeReference } from '../scripts/reference';
import type { ReaderGuide, SourceDefinition } from '../src/types';

function normalize(adapter: SourceDefinition['adapter'], html: string) {
  const source: SourceDefinition = { id: 'fixture', adapter, publisher: adapter, topic: 'Fixture', url: 'https://example.org/guide' };
  const guide: ReaderGuide = { id: source.id, title: 'Editorial title', publisher: source.publisher, topic: source.topic, sourceUrl: source.url, capturedAt: '2026-01-01', author: 'Author', publishedAt: '2025-12-01', warnings: ['Capture warning'], html, text: 'Old introduction', headings: [], sections: [] };
  return normalizeReference(source, guide);
}
const gifts = (rows: string) => `<p>Editorial introduction</p><table><tr><th>Name</th><th>Likes</th><th>Best gifts</th></tr>${rows}</table>`;
const bird = (rows: string, tail = '') => `<h2>Tutorial</h2><p>Benefits</p><h3 id="original-bird">Aster Bird Time Reactions</h3><table>${rows}</table>${tail}`;

describe('compact source references', () => {
  it('keeps every Polygon gift qualification, empty gift, and provenance but omits likes and media', () => {
    const guide = normalize('polygon', gifts('<tr><td><p>Aster</p><figure><img src="/local.png"><small>Image credit</small></figure></td><td>Unrelated likes</td><td>Tea &amp; sweets. Only rare tea; not mint.</td></tr><tr><td>Birch</td><td>Likes</td><td></td></tr>'));
    const $ = load(guide.html);
    expect($('tbody tr').length).toBe(2);
    expect($('tbody tr').first().text()).toContain('Tea & sweets. Only rare tea; not mint.');
    expect($('tbody tr').last().find('td').text()).toBe('');
    expect(guide).toMatchObject({ title: 'Gifts — Polygon', topic: 'Gifts', author: 'Author', publishedAt: '2025-12-01', capturedAt: '2026-01-01', warnings: ['Capture warning'] });
    expect(guide.html).not.toMatch(/Unrelated likes|img|Image credit|Editorial/);
    expect(guide.sections.map(s => s.heading)).toEqual(['Aster', 'Birch']);
    expect(guide.sections.every(s => $(`[id="${s.headingId}"]`).length === 1)).toBe(true);
    for (const heading of guide.headings) expect($(`[id="${heading.id}"]`).text()).toBe(heading.text);
    expect($('.table-scroll[tabindex="0"][role="region"]').length).toBe(1);
  });
  it('retains Polygon category exceptions and a restricted recipient outside the gift table', () => {
    const exception = "Aster, for example, loves tea sets, but doesn't like mint leaves.";
    const restricted = 'Birch is the exception. In Act 2, you can only give her gifts as Cedar, and her profile tells you what she likes (honey).';
    const input = `<p>Categories have a few exceptions. ${exception} There is a story reason for this.</p>${gifts('<tr><td>Aster</td><td>Quiet</td><td>Tea sets</td></tr>')}<p>The table lists the usual recipients. ${restricted} We recommend shopping early.</p>`;
    const guide = normalize('polygon', input);
    const $ = load(guide.html);
    expect($('tbody tr').length).toBe(2);
    expect($('tbody tr').first().find('td').text()).toBe(`Tea sets ${exception}`);
    expect($('tbody tr').last().find('th').text()).toBe('Birch');
    expect($('tbody tr').last().find('td').text()).toBe(restricted);
    expect(guide.sections[1].text).toContain(restricted);
    expect(guide.text).not.toMatch(/story reason|shopping early|usual recipients/);
  });
  it.each([
    'There are exceptions. Aster behaves differently.',
    'Birch is the exception. The restriction is unclear.',
    'Some exceptions exist. Missing, for example, loves tea sets, but dislikes mint.',
  ])('rejects unrecognized or unmatched Polygon exceptions: %s', paragraph => {
    expect(() => normalize('polygon', `<p>${paragraph}</p>${gifts('<tr><td>Aster</td><td></td><td>Tea</td></tr>')}`)).toThrow();
  });
  it('keeps answer-changing IGN table captions in content and search', () => {
    const guide = normalize('ign', bird('<caption>During winter use Wave.</caption><tr><th>Cold?</th></tr><tr><td>Nod</td></tr>'));
    expect(load(guide.html)('p').text()).toBe('During winter use Wave.');
    expect(guide.sections[0].text).toContain('During winter use Wave.');
  });
  it.each(['<tr><td></td><td>Likes</td><td>Tea</td></tr>', '<tr><td>Aster</td><td>Tea</td></tr>', '<tr><td rowspan="2">Aster</td><td>Likes</td><td>Tea</td></tr>'])('rejects ambiguous Polygon cells: %s', row => {
    expect(() => normalize('polygon', gifts(row))).toThrow();
  });
  it('makes all subjects in Dork paragraphs identifiable and preserves continuation caveats', () => {
    const paragraph = 'Aster likes tea, while Birch likes books; Cedar is a straightforward sweets recipient. Only rare sweets work.';
    const special = 'Dahlia is a special early case: during Act 2, only Aster can give her a gift, and her profile identifies mint as the answer.';
    const guide = normalize('dork', `<p>Introduction</p><h2>Aster to Dahlia</h2><p>${paragraph}</p><p>${special}</p><p>If funds are limited, concentrate presents on one ally.</p>`);
    expect(guide.title).toBe('Gifts — Dork');
    expect(guide.text).toContain(paragraph);
    expect(guide.text).toContain(special);
    expect(load(guide.html)('tbody th').map((_, e) => load(guide.html)(e).text()).get().join(' ')).toContain('Aster, Birch, Cedar');
    expect(guide.text).not.toMatch(/Introduction|If funds/);
  });
  it('keeps possessive Dork subjects and item caveats without treating item names as characters', () => {
    const guide = normalize('dork', '<h2>Aster to Birch</h2><p>Aster’s preferences span tea and sweets. Birch’s standout present is mint; Silver earrings and a blue ring are alternatives.</p>');
    expect(guide.sections[0].heading).toBe('Aster, Birch');
    expect(guide.text).toContain('Silver earrings and a blue ring are alternatives.');
  });
  it('retains standalone IGN notes and rejects unstructured Dork character content', () => {
    const guide = normalize('ign', bird('<tr><th>Rain?</th></tr><tr><td>Nod</td></tr>', '<div><strong>In winter, Wave instead.</strong></div>'));
    expect(guide.text).toContain('In winter, Wave instead.');
    expect(() => normalize('dork', '<h2>Aster to Birch</h2><div>Aster likes tea.</div>')).toThrow();
    expect(() => normalize('dork', '<h2>Aster to Birch</h2><h2>Cedar to Dahlia</h2><p>Cedar likes tea.</p>')).toThrow();
  });
  it('rejects unknown Dork preference blocks instead of dropping them', () => {
    expect(() => normalize('dork', '<h2>Aster to Birch</h2><p>Aster likes tea.</p><p>Birch has an unrecognized preference format.</p>')).toThrow();
  });
  it('pairs IGN prompts by column across empty advertisement rows and keeps uncertainty and notes', () => {
    const guide = normalize('ign', bird('<tr><th>First &amp; last?</th><th>Second?</th><td></td></tr><tr><td colspan="10"></td></tr><tr><td>Nod, unless it rains.</td><td>Unknown — not confirmed</td><td></td></tr>', '<p>During winter, use Wave instead of Nod.</p>'));
    const $ = load(guide.html);
    expect(guide.title).toBe('Pale Raven reactions — IGN');
    expect(guide.topic).toBe('Pale Raven reactions');
    expect($('h2').text()).toBe('Aster');
    expect($('h2').attr('id')).toBe('original-bird');
    expect($('tbody tr').map((_, e) => $(e).children().map((__, c) => $(c).text()).get()).get()).toEqual(['First & last?', 'Nod, unless it rains.', 'Second?', 'Unknown — not confirmed']);
    expect(guide.text).toContain('During winter, use Wave instead of Nod.');
    expect(guide.text).not.toMatch(/Tutorial|Benefits|Editorial/);
  });
  it.each([
    '<tr><th>Missing?</th></tr>',
    '<tr><th>Missing?</th></tr><tr><td></td></tr>',
    '<tr><th>One?</th><th>Two?</th></tr><tr><td>Nod</td></tr>',
    '<tr><th>One?</th><td></td></tr><tr><td>Nod</td><td>Unmatched answer</td></tr>',
    '<tr><th>One?</th></tr><tr><th>Another prompt?</th></tr><tr><td>Nod</td></tr>',
  ])('rejects unmatched or missing IGN answers: %s', rows => {
    expect(() => normalize('ign', bird(rows))).toThrow();
  });
  it('rejects unknown character headings and missing character tables', () => {
    expect(() => normalize('ign', `${bird('<tr><th>One?</th></tr><tr><td>Nod</td></tr>')}<h3>Unrecognized character block</h3><p>Text</p>`)).toThrow();
    expect(() => normalize('ign', '<h3>Aster Bird Time Reactions</h3><p>Absent</p>')).toThrow();
  });
  it('escapes retained text and produces deterministic unique gift anchors', () => {
    const input = gifts('<tr><td>Aster</td><td></td><td>&lt;script&gt; &amp; tea</td></tr><tr><td>Aster</td><td></td><td>Books</td></tr>');
    const first = normalize('polygon', input);
    expect(first).toEqual(normalize('polygon', input));
    expect(new Set(first.headings.map(h => h.id)).size).toBe(2);
    expect(load(first.html)('script').length).toBe(0);
    expect(first.text).toContain('<script> & tea');
  });
});
