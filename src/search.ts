import type { ReaderGuide } from './types';

export interface SearchMatch { headingId: string; heading: string; excerpt: string }
export interface SearchResult { guide: ReaderGuide; matches: SearchMatch[] }

function excerpt(text: string, query: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const position = clean.toLowerCase().indexOf(query);
  const start = Math.max(0, position - 70);
  const end = Math.min(clean.length, start + 230);
  return `${start ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}

export function searchGuides(guides: ReaderGuide[], query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  return guides.flatMap(guide => {
    if (!needle) return [{ guide, matches: [] }];
    const matches = guide.sections
      .filter(section => `${section.heading} ${section.text}`.toLowerCase().includes(needle))
      .map(section => ({ headingId: section.headingId, heading: section.heading, excerpt: excerpt(section.text, needle) }));
    if (!matches.length && guide.text.toLowerCase().includes(needle)) {
      matches.push({ headingId: '', heading: '', excerpt: excerpt(guide.text, needle) });
    }
    return matches.length || guide.title.toLowerCase().includes(needle) ? [{ guide, matches }] : [];
  });
}
