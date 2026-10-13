import { describe, expect, it } from "vitest";
import { careerGuides, careerGuideWordCount, editorialPolicy, getCareerGuide } from "@/lib/career-guides";

describe("the original career guide library", () => {
  it("contains 20 distinct, substantive guides with serializable data", () => {
    expect(careerGuides).toHaveLength(20);
    expect(new Set(careerGuides.map(guide => guide.slug)).size).toBe(20);
    expect(new Set(careerGuides.map(guide => guide.title)).size).toBe(20);
    expect(JSON.parse(JSON.stringify(careerGuides))).toEqual(careerGuides);
    for (const guide of careerGuides) {
      expect(guide.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(careerGuideWordCount(guide), guide.slug).toBeGreaterThanOrEqual(500);
      expect(guide.sections, guide.slug).toHaveLength(5);
      expect(guide.summary.length, guide.slug).toBeGreaterThan(150);
      expect(guide.description.length, guide.slug).toBeGreaterThan(80);
      expect(guide.takeaways, guide.slug).toHaveLength(3);
      expect(guide.readingMinutes).toBe(Math.ceil(careerGuideWordCount(guide) / 200));
      expect(guide.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updatedAt >= guide.publishedAt).toBe(true);
    }
  });

  it("keeps examples visibly fictional, related links valid and source references traceable", () => {
    const domains = new Set(["careerservices.fas.harvard.edu", "capd.mit.edu", "ocs.yale.edu", "www.linkedin.com", "u.ae", "www.federalerp.gov.ae", "support.greenhouse.io", "support.microsoft.com", "jobvance.io"]);
    for (const guide of careerGuides) {
      const examples = guide.sections.filter(section => section.example);
      expect(examples.length, guide.slug).toBeGreaterThanOrEqual(1);
      for (const section of examples) expect(section.example?.label).toMatch(/fictional/i);
      expect(new Set(guide.relatedSlugs).size).toBe(guide.relatedSlugs.length);
      expect(guide.relatedSlugs.length).toBeGreaterThanOrEqual(2);
      for (const slug of guide.relatedSlugs) {
        expect(slug).not.toBe(guide.slug);
        expect(getCareerGuide(slug), `${guide.slug} → ${slug}`).toBeDefined();
      }
      expect(new Set(guide.sources.map(source => source.id)).size).toBe(guide.sources.length);
      for (const source of guide.sources) {
        const url = new URL(source.url);
        expect(url.protocol).toBe("https:");
        expect(domains.has(url.hostname), source.url).toBe(true);
        expect(source.title.length).toBeGreaterThan(10);
      }
      for (const section of guide.sections) {
        for (const id of section.sourceIds ?? []) expect(guide.sources.some(source => source.id === id), `${guide.slug}: ${id}`).toBe(true);
      }
    }
  });

  it("does not recycle entire paragraphs or invent outcome promises", () => {
    const paragraphs = careerGuides.flatMap(guide => guide.sections.flatMap(section => section.paragraphs));
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
    const text = JSON.stringify(careerGuides);
    expect(text).not.toMatch(/(?:guaranteed interviews|100% ATS|beat any ATS|undetectable AI|trusted by \d|customers hired)/i);
    expect(editorialPolicy.publisher).toBe("Jobvance Editorial");
    expect(editorialPolicy.disclosure).toMatch(/AI assistance/);
    expect(editorialPolicy.disclosure).toMatch(/no individual career adviser or legal expert is claimed/);
  });

  it("returns no fabricated article for an unknown or missing slug", () => {
    expect(getCareerGuide("not-a-real-guide")).toBeUndefined();
    expect(getCareerGuide(undefined)).toBeUndefined();
  });
});
