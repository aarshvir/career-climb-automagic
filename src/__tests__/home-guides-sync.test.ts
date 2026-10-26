import { describe, expect, it } from 'vitest';
import { careerGuides } from '@/lib/career-guides';
import { homeGuides } from '@/lib/home-guides';

describe('home guide index', () => {
  it('only links to published guides, with matching title, category and reading time', () => {
    for (const [slug, title, meta] of homeGuides) {
      const guide = careerGuides.find(item => item.slug === slug);
      expect(guide, slug).toBeDefined();
      expect(title).toBe(guide!.title);
      expect(meta).toBe(`${guide!.category} · ${guide!.readingMinutes} min`);
    }
  });
});
