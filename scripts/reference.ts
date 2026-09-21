import { load, type CheerioAPI } from 'cheerio';
import type { ReaderGuide, SourceDefinition } from '../src/types';

const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const slug = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
const fail = (message: string): never => { throw new Error(`Cannot normalize reference: ${message}`); };
type Gift = { character: string; gifts: string };
type Reactions = { character: string; anchor?: string; pairs: [string, string][]; notes: string[] };

// Block boundaries must survive conversion to text, while inline spelling stays intact.
function plain(html: string): string {
  const $ = load(html, null, false);
  $('img,figure,figcaption,.image-unavailable').remove();
  $('br').replaceWith(' ');
  $('p,li,div').append(' ');
  return compact($.root().text());
}

// Traverse wrappers without losing standalone text or notes outside paragraphs.
function blocks($: CheerioAPI) {
  const result: { tag: string; html: string; text: string; id?: string }[] = [];
  const structural = 'h2,h3,h4,h5,h6,table,p,ul,ol,blockquote';
  const visit = (nodes: ReturnType<CheerioAPI>) => {
    nodes.each((_, node) => {
      if (node.type === 'text') {
        if (compact(node.data)) result.push({ tag: 'text', html: escape(node.data), text: compact(node.data) });
      } else if (node.type === 'tag') {
        const element = $(node);
        if (element.is(structural) || !element.find(structural).length) {
          const html = element.html() || '';
          result.push({ tag: node.tagName, html, text: plain($.html(node)), id: element.attr('id') });
        } else visit(element.contents());
      }
    });
  };
  visit($('body').contents());
  return result;
}

function polygon($: CheerioAPI): Gift[] {
  const tables = $('table').filter((_, table) => {
    const headers = $(table).find('tr').first().children().map((__, cell) => plain($(cell).html() || '')).get();
    return /^(Name|Character)$/i.test(headers[0] || '') && /^(Best gifts|Gifts)$/i.test(headers[2] || '') && /^Likes$/i.test(headers[1] || '') && headers.length === 3;
  });
  if (tables.length !== 1) fail('expected one Polygon character/likes/gifts table');
  const rows: Gift[] = [];
  tables.find('tr').slice(1).each((_, row) => {
    const cells = $(row).children('th,td');
    if (cells.length !== 3 || cells.is('[colspan],[rowspan]')) fail('malformed Polygon gift row');
    const character = plain(cells.eq(0).html() || '');
    if (!character) fail('empty Polygon character');
    rows.push({ character, gifts: plain(cells.eq(2).html() || '') });
  });
  if (!rows.length) fail('empty Polygon gift table');
  // Polygon places category exceptions and restricted recipients in prose outside its table.
  for (const block of blocks($)) {
    if (block.tag === 'table' || !/\bexceptions?\b/i.test(block.text)) continue;
    if (block.tag !== 'p') fail('unrecognized Polygon exception block');
    const sentences = block.text.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u);
    const category = sentences.filter(sentence => /^[\p{Lu}][\p{L} -]*, for example, .+, but .+\.$/u.test(sentence));
    const special = sentences.findIndex(sentence => /^[\p{Lu}][\p{L} -]* is the exception\.$/u.test(sentence));
    if (category.length === 1 && special === -1) {
      const character = category[0].split(',')[0];
      const matches = rows.filter(row => row.character === character);
      if (matches.length !== 1) fail('unmatched Polygon category exception');
      matches[0].gifts = compact(`${matches[0].gifts} ${category[0]}`);
    } else if (!category.length && special !== -1) {
      const character = sentences[special].replace(/ is the exception\.$/, '');
      const restriction = sentences[special + 1] || '';
      if (!/^In Act \d+, you can only give (?:him|her|them) gifts as [\p{Lu}][\p{L} -]+, and .+ (?:likes|like) \(.+\)\.$/u.test(restriction) || rows.some(row => row.character === character)) fail('unrecognized Polygon restricted recipient');
      rows.push({ character, gifts: `${sentences[special]} ${restriction}` });
    } else fail('unrecognized Polygon exception prose');
  }
  return rows;
}

function dork($: CheerioAPI): Gift[] {
  const rows: Gift[] = [];
  let active = false;
  let ended = false;
  let sectionStart = 0;
  // Subject grammar is deliberately bounded: changed prose requires review rather than guessed names.
  const subject = /^([\p{Lu}][\p{L}-]*(?: [\p{Lu}][\p{L}-]*){0,2})(?:[’']s)? (?:(?:likes|prefers|wants|takes|accepts)\b|responds to\b|can take\b|is (?:a straightforward|a special early case|another dependable recipient|best served|flexible)\b|preferences span\b|standout present\b)/u;
  blocks($).forEach(node => {
    const { text } = node;
    if (/^h[2-6]$/.test(node.tag)) {
      if (node.tag !== 'h2' || !/^\S.+ to \S.+$/.test(text) || ended) fail('unknown Dork character section');
      if (active && rows.length === sectionStart) fail('empty Dork character section');
      sectionStart = rows.length;
      active = true;
      return;
    }
    if (!active || !text) return;
    if (node.tag !== 'p') fail('unknown Dork character block');
    if (/^If funds are limited,/.test(text)) { ended = true; return; }
    if (ended) fail('unexpected Dork content after conclusion');
    const names: string[] = [];
    const clauses = text.split(/(?:[.;]\s+|,\s+while\s+)/);
    for (const clause of clauses) {
      const match = clause.match(subject);
      if (match) names.push(match[1]);
      else if (/^[\p{Lu}]/u.test(clause) && !/^(?:She|He|They|It|Only|Books|Also|During|However|These|This)\b/.test(clause) && !/^[\p{Lu}][\p{L}-]* [\p{Ll}][\p{L}-]* .*\bare\b/u.test(clause)) fail(`unknown Dork preference clause: ${clause}`);
    }
    if (!names.length || !text.match(subject)) fail('unrecognized Dork preference paragraph');
    rows.push({ character: [...new Set(names)].join(', '), gifts: text });
  });
  if (!rows.length || rows.length === sectionStart) fail('no Dork preference paragraphs in section');
  return rows;
}

function ign($: CheerioAPI): Reactions[] {
  const characters: Reactions[] = [];
  let current: Reactions | undefined;
  blocks($).forEach(node => {
    const { text } = node;
    if (/^h[2-6]$/.test(node.tag)) {
      const name = text.match(/^(.+) Bird Time Reactions$/);
      if (name) {
        current = { character: name[1], anchor: node.id, pairs: [], notes: [] };
        characters.push(current);
      } else if (current || node.tag !== 'h2') fail('unknown IGN character heading');
      return;
    }
    if (!current) return;
    if (node.tag !== 'table') {
      if (text) current.notes.push(text);
      return;
    }
    let pending: string[] | undefined;
    const tableBody = load(node.html, null, false);
    tableBody('caption').each((_, caption) => {
      const note = plain(tableBody(caption).html() || '');
      if (note) current!.notes.push(note);
    });
    tableBody('tr').each((__, row) => {
      const cells = $(row).children('th,td');
      const values = cells.map((___, cell) => plain($(cell).html() || '')).get();
      // Empty ad rows can span all columns; they are not answer rows.
      if (values.every(value => !value)) return;
      if (!cells.length || cells.is('[colspan],[rowspan]')) fail('ambiguous IGN table cells');
      const isPrompt = cells.toArray().some(cell => cell.tagName === 'th');
      if (isPrompt) {
        if (pending) fail('IGN prompt has no answer row');
        cells.each((index, cell) => {
          if (cell.tagName !== 'th' && values[index]) fail('mixed IGN prompt/answer row');
        });
        pending = values;
      } else {
        if (!pending || pending.length !== values.length) return fail('unmatched IGN answer row');
        pending.forEach((prompt, index) => {
          if (Boolean(prompt) !== Boolean(values[index])) fail('missing IGN prompt or answer');
          if (prompt) current!.pairs.push([prompt, values[index]]);
        });
        pending = undefined;
      }
    });
    if (pending) fail('IGN prompt has no answer row');
  });
  if (!characters.length || characters.some(character => !character.pairs.length)) fail('missing IGN character reaction table');
  return characters;
}

const table = (label: string, first: string, second: string, rows: string) => `<div class="table-scroll" role="region" aria-label="${escape(label)}" tabindex="0"><table><thead><tr><th scope="col">${first}</th><th scope="col">${second}</th></tr></thead><tbody>${rows}</tbody></table></div>`;

/** Rebuild browser content from an immutable, sanitized publisher capture. */
export function normalizeReference(source: SourceDefinition, guide: ReaderGuide): ReaderGuide {
  const $ = load(guide.html);
  const headings: ReaderGuide['headings'] = [];
  const sections: ReaderGuide['sections'] = [];
  const used = new Set<string>();
  const anchor = (text: string, preferred?: string) => {
    const base = preferred || `section-${slug(text)}`;
    let id = base;
    for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
    used.add(id);
    return id;
  };
  let html: string;
  const topic = source.adapter === 'ign' ? 'Pale Raven reactions' : 'Gifts';
  const publisher = { polygon: 'Polygon', dork: 'Dork', ign: 'IGN' }[source.adapter];
  const title = `${topic} — ${publisher}`;
  if (source.adapter === 'ign') {
    html = ign($).map(character => {
      const id = anchor(character.character, character.anchor);
      headings.push({ id, text: character.character, level: 2 });
      sections.push({ headingId: id, heading: character.character, text: [character.character, ...character.pairs.flat(), ...character.notes].join('\n') });
      const rows = character.pairs.map(([prompt, reaction]) => `<tr><th scope="row">${escape(prompt)}</th><td>${escape(reaction)}</td></tr>`).join('');
      return `<h2 id="${escape(id)}">${escape(character.character)}</h2>${table(`${character.character} reactions`, 'Prompt', 'Reaction', rows)}${character.notes.map(note => `<p>${escape(note)}</p>`).join('')}`;
    }).join('');
  } else {
    const rows = (source.adapter === 'polygon' ? polygon($) : dork($)).map(row => {
      const id = anchor(row.character);
      headings.push({ id, text: row.character, level: 2 });
      sections.push({ headingId: id, heading: row.character, text: `${row.character}\n${row.gifts}` });
      return `<tr><th scope="row" id="${escape(id)}">${escape(row.character)}</th><td>${escape(row.gifts)}</td></tr>`;
    }).join('');
    html = table(title, 'Character', 'Gifts and caveats', rows);
  }
  return { ...guide, title, topic, html, text: sections.map(section => section.text).join('\n'), headings, sections };
}
