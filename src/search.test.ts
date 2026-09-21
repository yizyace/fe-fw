import { describe, expect, it } from 'vitest';
import { searchGuides } from './search';
import type { ReaderGuide } from './types';

const guide: ReaderGuide = {
  id: 'beginner-guide', title: 'A guide to Fortune’s Weave', publisher: 'Polygon', topic: 'Getting started',
  sourceUrl: 'https://example.com/guide', capturedAt: '2026-09-21T00:00:00Z', html: '',
  text: 'Start with your allies. Build support between battles. A rare crest unlocks a new path.',
  headings: [{ id: 'support', text: 'Building support', level: 2 }],
  sections: [{ headingId: 'support', heading: 'Building support', text: 'Build support between battles.' }], warnings: [],
};

describe('searchGuides', () => {
  it('shows the whole library for an empty or whitespace query', () => {
    expect(searchGuides([guide], '  ').map(result => result.guide.id)).toEqual(['beginner-guide']);
  });
  it('finds a title without a case-sensitive match', () => {
    expect(searchGuides([guide], '  FORTUNE’S  ')[0]?.guide.id).toBe('beginner-guide');
  });
  it('returns a matching passage and the exact section anchor', () => {
    expect(searchGuides([guide], 'SUPPORT')[0]?.matches).toEqual([
      { headingId: 'support', heading: 'Building support', excerpt: 'Build support between battles.' },
    ]);
  });
  it('finds text outside indexed sections', () => {
    const result = searchGuides([guide], 'rare crest');
    expect(result[0]?.matches[0]?.excerpt).toContain('rare crest');
    expect(result[0]?.matches[0]?.headingId).toBe('');
  });
  it('centers a bounded excerpt on a match deep in a long section', () => {
    const text = `${'An ordinary sentence. '.repeat(80)}The Moonstone is here. ${'More context. '.repeat(80)}`;
    const longGuide = { ...guide, text, sections: [{ headingId: 'treasure', heading: 'Treasure', text }] };
    const match = searchGuides([longGuide], 'moonstone')[0]?.matches[0];
    expect(match?.excerpt).toContain('Moonstone');
    expect(match?.excerpt.length).toBeLessThanOrEqual(240);
    expect(match?.headingId).toBe('treasure');
  });
  it('does not treat punctuation as a regular expression', () => {
    expect(searchGuides([guide], '.*')).toEqual([]);
  });
});
