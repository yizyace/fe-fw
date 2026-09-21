import { load } from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import type { AssetRecord, ReaderGuide, SourceDefinition } from '../src/types';

export const EXTRACTION_VERSION = '3';
export type Extracted = Pick<ReaderGuide, 'title' | 'author' | 'publishedAt' | 'html' | 'text' | 'headings' | 'sections' | 'warnings'>;
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const slug = (text: string) => text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heading';
export const bodySelectors = {
  polygon: '[itemprop="articleBody"], .article-body',
  dork: 'article .max-w-3xl > div:first-child',
  ign: '.wiki-html',
} as const;

export function sanitizeArticle(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'span', 'section', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sup', 'sub', 'br', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'figure', 'figcaption', 'img'],
    allowedAttributes: {
      '*': ['id'], a: ['href', 'title', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'],
      th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'], col: ['span'],
      ol: ['start', 'reversed'], li: ['value'],
      div: ['id', 'class', 'role', 'aria-label', 'tabindex'],
    },
    allowedClasses: { div: ['table-scroll', 'image-unavailable'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
  });
}

export function extractArticle(source: SourceDefinition, raw: string, url: string): Extracted {
  const $ = load(raw);
  if (/just a moment|attention required|access denied|error 403|robot check/i.test($('title').text()) ||
      ($('body').text().length < 20000 && /verify you are human|sorry, you have been blocked/i.test($('body').text()))) {
    throw new Error('Rejected challenge page');
  }
  const body = $(bodySelectors[source.adapter]).first();
  if (!body.length) throw new Error(`Article body missing for ${source.adapter}; inspect the saved raw HTML`);
  if (source.adapter === 'dork') body.prepend($('article .hero-container-3-2').first().clone());
  if (source.adapter === 'polygon') body.prepend($('.article-header .heading_image figure').first().clone());
  // IGN wraps article images in viewer controls; keep the image, discard the control.
  body.find('.wiki-image button').each((_, element) => { $(element).replaceWith($(element).find('img')); });
  const title = compact((source.adapter === 'ign' ? $('.wiki-page h1') : $('h1')).first().text()) || compact($('h1').first().text()) || compact($('title').text());
  const authors = $('meta[property="article:author"]').map((_, e) => $(e).attr('content')).get();
  const author = authors.join(', ') || $('meta[name="author"]').attr('content');
  const publishedAt = $('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime');
  body.find('script, style, iframe, noscript, template, video, audio, object, embed, form, button, input, nav, aside, header, footer, ins, .newsletter, .related-articles, .related, .ad, .advertisement, .ad-container, .wiki-video, [data-ad], [aria-hidden="true"]').remove();
  body.find('h1').remove();
  const warnings: string[] = [];
  const originalIds = new Map<string, string>();
  const ids = new Set<string>();
  function unique(base: string) {
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  }
  body.find('[id]').each((_, e) => {
    const el = $(e); const old = el.attr('id')!;
    const id = unique(`anchor-${slug(old)}`);
    el.attr('id', id); originalIds.set(old, id);
  });
  const headings: ReaderGuide['headings'] = [];
  body.find('h2,h3,h4,h5,h6').each((_, e) => {
    const el = $(e); const text = compact(el.text());
    const id = unique(`section-${slug(text)}`);
    const prior = el.attr('id');
    for (const [old, mapped] of originalIds) if (mapped === prior) originalIds.set(old, id);
    el.attr('id', id);
    headings.push({ id, text, level: Number(e.tagName.slice(1)) });
  });
  body.find('a').each((_, e) => {
    const el = $(e); const href = el.attr('href'); if (!href) return;
    try {
      const resolved = new URL(href, url); const base = new URL(url);
      if (!['http:', 'https:', 'mailto:'].includes(resolved.protocol)) { el.removeAttr('href'); return; }
      if (resolved.origin === base.origin && resolved.pathname.replace(/\/$/, '') === base.pathname.replace(/\/$/, '') && resolved.hash) {
        const old = decodeURIComponent(resolved.hash.slice(1));
        if (originalIds.has(old)) el.attr('href', `#${originalIds.get(old)}`);
        else { el.attr('href', resolved.href); warnings.push(`Unresolved source anchor: ${resolved.hash}`); }
      } else el.attr('href', resolved.href);
      el.attr('rel', 'noreferrer');
    } catch { el.removeAttr('href'); }
  });
  body.find('img').each((_, e) => {
    const el = $(e);
    const src = el.attr('data-src') || el.attr('data-lazy-src') || el.attr('data-img-url') || el.attr('src') || el.attr('srcset')?.split(',')[0]?.trim().split(/\s/)[0];
    try {
      const resolved = new URL(src || '', url);
      if (!src || !['http:', 'https:'].includes(resolved.protocol)) throw new Error('Missing image URL');
      el.attr('src', resolved.href).attr('loading', 'lazy').attr('alt', el.attr('alt') || '');
    } catch {
      const replacement = $('<div class="image-unavailable">Image unavailable: no downloadable source.</div>');
      if (el.attr('id')) replacement.attr('id', el.attr('id')!);
      el.replaceWith(replacement);
      warnings.push('Image has no downloadable source');
    }
  });
  body.find('table').each((i, e) => {
    $(e).wrap(`<div class="table-scroll" role="region" aria-label="Table ${i + 1}" tabindex="0"></div>`);
  });
  const html = sanitizeArticle(body.html() || '');
  const content = indexContent(html, title);
  if (!title || content.text.length < 80) throw new Error('Article extraction is empty or too short');
  if (source.adapter !== 'dork' && !load(html)('table').length) throw new Error('Expected guide table missing');
  if (source.adapter === 'dork' && !headings.length) throw new Error('Expected character sections missing');
  return { title, author, publishedAt, html, ...content, headings, warnings };
}

export function localizeImages(html: string, assets: AssetRecord[]): string {
  const $ = load(html, null, false);
  const byUrl = new Map(assets.map(a => [a.url, a]));
  $('img').each((_, e) => {
    const el = $(e); const asset = byUrl.get(el.attr('src') || '');
    if (asset?.path) el.attr('src', `/generated/${asset.path}`);
    else {
      const replacement = $('<div class="image-unavailable"></div>').text(`Image unavailable${el.attr('alt') ? `: ${el.attr('alt')}` : '.'}`);
      if (el.attr('id')) replacement.attr('id', el.attr('id')!);
      el.replaceWith(replacement);
    }
  });
  return $.html();
}

export function indexContent(html: string, title: string): Pick<ReaderGuide, 'text' | 'sections'> {
  const $ = load(html, null, false);
  const sections: ReaderGuide['sections'] = [{ headingId: '', heading: title, text: '' }];
  // Walk text nodes once so nested tables/lists remain searchable without duplication.
  const rootNodes = $.root()[0].children;
  function walk(nodes: typeof rootNodes) {
    for (const node of nodes) {
      if (node.type === 'text') sections.at(-1)!.text += ` ${node.data}`;
      else if ('children' in node) {
        if (node.type === 'tag' && /^h[2-6]$/.test(node.name)) {
          sections.push({ headingId: $(node).attr('id') || '', heading: compact($(node).text()), text: '' });
        }
        walk(node.children);
      }
    }
  }
  walk(rootNodes);
  for (const section of sections) section.text = compact(section.text);
  return { text: sections.map(s => s.text).join('\n'), sections };
}
