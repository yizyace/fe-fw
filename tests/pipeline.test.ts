import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import type { SourceDefinition } from '../src/types';
import { buildLibrary, captureSource, verifyCorpus } from '../scripts/corpus';
let root: string; let server: Server; let source: SourceDefinition; let fail = false;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'guide-test-'));fail=false;
 server=createServer((req,res)=>{if(req.url==='/image.png'){res.writeHead(200,{'content-type':'image/png'});res.end(png);return;}if(fail){res.writeHead(503);res.end('Unavailable');return;}res.writeHead(200,{'content-type':'text/html'});res.end('<title>Gift guide</title><h1>Gift guide</h1><div class="article-body"><p>Save a useful guide with sufficient article context for reading the gift list below while you are offline.</p><h2>Favorites</h2><table><tr><th>Name</th><th>Gift</th></tr><tr><td>Hero</td><td>Flowers</td></tr></table><img src="/image.png" alt="Flower"></div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('server');
 source={id:'fixture',url:`http://127.0.0.1:${address.port}/guide`,publisher:'Fixture',topic:'Gifts',adapter:'polygon'};
 await writeFile(join(root,'sources.json'),JSON.stringify([source]));
});
afterEach(async()=>{vi.unstubAllGlobals();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});});
it('retains the last working capture when a refresh fails and keeps previous successes',async()=>{
 const first=await captureSource(source,{root});const second=await captureSource(source,{root});expect(second.captureId).not.toBe(first.captureId);
 fail=true;await expect(captureSource(source,{root})).rejects.toThrow(/503/);
 expect(JSON.parse(await readFile(join(root,'corpus/fixture/current.json'),'utf8')).captureId).toBe(second.captureId);
 expect(await readdir(join(root,'corpus/fixture/captures'))).toContain(first.captureId);
 const library=await buildLibrary(root);expect(library.guides[0].text).toContain('Flowers');
});
it('builds and verifies local data without network and detects tampered provenance or missing assets',async()=>{
 const manifest=await captureSource(source,{root});vi.stubGlobal('fetch',()=>{throw Error('Network forbidden');});
 const library=await buildLibrary(root);expect(library.guides[0].html).toMatch(/src="\/generated\/assets\//);expect(await verifyCorpus(root)).toEqual([]);
 await rm(join(root,'public/generated',manifest.assets[0].path!));expect((await verifyCorpus(root)).join(' ')).toMatch(/asset/i);
 await writeFile(join(root,'corpus/fixture/captures',manifest.captureId,'raw.html'),'tampered');await expect(buildLibrary(root)).rejects.toThrow(/hash/i);
});
it('generates an empty library for a fresh checkout',async()=>{
 expect((await buildLibrary(root)).guides).toEqual([]);expect(await verifyCorpus(root)).toEqual([]);
});

const suppliedArticle = (content: string) => `<h1>Refreshed guide</h1><div class="article-body"><p>This updated guide has enough context to read the table and understand the useful details preserved in this saved article.</p><table><tr><th>Name</th><th>Gift</th></tr><tr><td>Hero</td><td>Tea</td></tr></table>${content}</div>`;

it('retains the last working capture when extracted content fails validation', async () => {
 const previous = await captureSource(source, {root});
 await buildLibrary(root);
 const htmlPath = join(root, 'input.html');
 // Sanitization removes mark but leaves its rewritten incoming anchor.
 const html = suppliedArticle('<a href="#removed">Details</a><mark id="removed">Updated details</mark>');
 await writeFile(htmlPath, html);
 await expect(captureSource(source, {root, htmlPath})).rejects.toThrow(/Broken anchor/);
 expect(JSON.parse(await readFile(join(root, 'corpus/fixture/current.json'), 'utf8')).captureId).toBe(previous.captureId);
 const captures = await readdir(join(root, 'corpus/fixture/captures'));
 const failed = captures.find(id => id !== previous.captureId)!;
 const folder = join(root, 'corpus/fixture/captures', failed);
 expect(JSON.parse(await readFile(join(folder, 'attempt.json'), 'utf8')).error).toMatch(/Broken anchor/);
 expect(await readFile(join(folder, 'raw.html'), 'utf8')).toBe(html);
 await expect(readFile(join(folder, 'manifest.json'))).rejects.toMatchObject({code: 'ENOENT'});
 expect((await buildLibrary(root)).guides[0].text).toContain('Flowers');
 expect(await verifyCorpus(root)).toEqual([]);
});

it.each(['data:image/gif;base64,aaa', '/missing.png'])('builds anchored unavailable images with source %s', async src => {
 const htmlPath = join(root, 'input.html');
 await writeFile(htmlPath, suppliedArticle(`<a href="#gift-photo">See photo</a><img id="gift-photo" src="${src}" alt="Gift">`));
 await captureSource(source, {root, htmlPath});
 vi.stubGlobal('fetch', () => { throw Error('Network forbidden'); });
 const guide = (await buildLibrary(root)).guides[0];
 const $ = load(guide.html);
 expect($('a').attr('href')).toBe('#anchor-gift-photo');
 expect($('#anchor-gift-photo').text()).toContain('Image unavailable');
 expect($('img').length).toBe(0);
 expect(await verifyCorpus(root)).toEqual([]);
});
