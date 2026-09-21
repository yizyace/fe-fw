import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { extractArticle } from '../scripts/extract';
import type { SourceDefinition } from '../src/types';
const source: SourceDefinition = {id:'fixture',url:'https://example.org/guide',publisher:'Fixture',topic:'Gifts',adapter:'polygon'};
const fixture = `<html><head><title>Gift guide</title><meta property="article:author" content="Test Author"></head><body><h1>Gift guide</h1><section class="article-body"><p>Choose gifts from the market every week. This introduction contains helpful context about the gift table below.</p><h2 id="Original">Favorites</h2><table><caption>Gift list</caption><tr><th>Name</th><th>Gift</th></tr><tr><td>Hero</td><td>Flowers</td></tr></table><ul><li>One</li></ul><figure><img data-src="/flower.png" src="data:image/gif;base64,aaa" onerror="alert(1)"><figcaption>A flower</figcaption></figure><a href="#Original">Jump</a><a href="../more">More</a><script>alert(1)</script><iframe src="https://ads.example/"></iframe><p style="background:url(https://tracker/)" onclick="x()">Safe text</p><a href="javascript:alert(1)">Bad link</a><div class="newsletter">Subscribe now</div><h2>Favorites</h2></section></body></html>`;
describe('article extraction',()=>{
 it('preserves table values, headings, captions and lists while dropping active markup and promotions',()=>{
  const result=extractArticle(source,fixture,source.url);const $=load(result.html);
  expect($('td').map((_,e)=>$(e).text()).get()).toEqual(['Hero','Flowers']);expect($('caption').text()).toBe('Gift list');expect($('li').text()).toBe('One');expect($('figcaption').text()).toBe('A flower');
  expect(result.html).not.toMatch(/script|iframe|onerror|onclick|style=|javascript:|Subscribe now/);expect(result.author).toBe('Test Author');expect(result.headings.map(h=>h.id)).toEqual(['section-favorites','section-favorites-2']);expect($('a').first().attr('href')).toBe('#section-favorites');expect($('a').eq(1).attr('href')).toBe('https://example.org/more');
 });
 it('resolves lazy image URLs in captured HTML',()=>{
  const result=extractArticle(source,fixture,source.url);expect(load(result.html)('img').attr('src')).toBe('https://example.org/flower.png');
 });
 it('rejects challenge pages and incomplete publisher content',()=>{
  expect(()=>extractArticle(source,'<title>Just a moment...</title><div>Verify you are human</div>',source.url)).toThrow(/challenge/i);
  expect(()=>extractArticle(source,'<h1>Not found</h1>',source.url)).toThrow(/article/i);
  expect(()=>extractArticle(source,fixture.replace(/<table>[\s\S]*?<\/table>/,''),source.url)).toThrow(/table/i);
 });
 it('preserves article images inside publisher viewer buttons and Dork hero images',()=>{
  const ign=extractArticle({...source,adapter:'ign'},`<h1>Bird guide</h1><div class="wiki-html">${load(fixture)('.article-body').html()}<span class="wiki-image"><button><img src="/bird.jpg" alt="Bird"></button></span></div>`,source.url);
  expect(load(ign.html)('img[src="https://example.org/bird.jpg"]').length).toBe(1);
  const dork=extractArticle({...source,adapter:'dork'},`<h1>Gift guide</h1><article><div class="hero-container-3-2"><img src="/hero.jpg" alt="Hero"></div><div class="max-w-3xl"><div>${load(fixture)('.article-body').html()}</div></div></article>`,source.url);
  expect(load(dork.html)('img[src="https://example.org/hero.jpg"]').length).toBe(1);
 });
 it('uses focused Dork and IGN body selectors',()=>{
  for(const [adapter,body] of [['dork',`<article><div class="max-w-3xl"><div>${load(fixture)('.article-body').html()}</div><aside>Promotion</aside></div></article>`],['ign',`<div class="wiki-html">${load(fixture)('.article-body').html()}</div>`]] as const){
   const result=extractArticle({...source,adapter},`<h1>Fixture</h1>${body}`,source.url);expect(result.text).toContain('Hero');expect(result.text).not.toContain('Promotion');
  }
 });
});
