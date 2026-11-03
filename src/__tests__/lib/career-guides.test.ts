import { describe, expect, it } from "vitest";
import { careerGuides, careerGuideWordCount, editorialPolicy, getCareerGuide } from "@/lib/career-guides";

describe("the original career guide library", () => {
  it("contains 21 distinct, substantive guides with serializable data", () => {
    expect(careerGuides).toHaveLength(21);
    expect(new Set(careerGuides.map(guide => guide.slug)).size).toBe(21);
    expect(new Set(careerGuides.map(guide => guide.title)).size).toBe(21);
    expect(JSON.parse(JSON.stringify(careerGuides))).toEqual(careerGuides);
    for (const guide of careerGuides) {
      expect(guide.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(careerGuideWordCount(guide), guide.slug).toBeGreaterThanOrEqual(500);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(5);
      expect(guide.sections.length, guide.slug).toBeLessThanOrEqual(7);
      expect(guide.summary.length, guide.slug).toBeGreaterThan(150);
      expect(guide.description.length, guide.slug).toBeGreaterThan(80);
      expect(guide.takeaways, guide.slug).toHaveLength(3);
      expect(guide.readingMinutes).toBe(Math.ceil(careerGuideWordCount(guide) / 200));
      expect(guide.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updatedAt >= guide.publishedAt).toBe(true);
    }
  });

  it("identifies worked examples, keeps related links valid and source references traceable", () => {
    const domains = new Set(["careerservices.fas.harvard.edu", "capd.mit.edu", "ocs.yale.edu", "www.linkedin.com", "u.ae", "www.federalerp.gov.ae", "support.greenhouse.io", "support.microsoft.com", "jobvance.io", "www.jobscan.co", "skillsyncer.com"]);
    for (const guide of careerGuides) {
      const examples = guide.sections.filter(section => section.example);
      expect(examples.length, guide.slug).toBeGreaterThanOrEqual(1);
      for (const section of examples) {
        expect(section.example?.label).toMatch(/^(?:(?:worked|planning) example|example outreach draft)$/i);
        expect(section.example?.text.trim().length, guide.slug).toBeGreaterThan(80);
      }
      expect(new Set(guide.relatedSlugs).size).toBe(guide.relatedSlugs.length);
      expect(guide.relatedSlugs.length).toBeGreaterThanOrEqual(2);
      for (const slug of guide.relatedSlugs) {
        expect(slug).not.toBe(guide.slug);
        expect(getCareerGuide(slug), `${guide.slug} → ${slug}`).toBeDefined();
      }
      expect(guide.sources.length, guide.slug).toBeGreaterThan(0);
      expect(new Set(guide.sources.map(source => source.id)).size).toBe(guide.sources.length);
      for (const source of guide.sources) {
        const url = new URL(source.url);
        expect(url.protocol).toBe("https:");
        expect(url.username).toBe("");
        expect(url.password).toBe("");
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
    expect(editorialPolicy.researchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(Date.parse(editorialPolicy.researchedAt))).toBe(true);
    expect(editorialPolicy.disclosure).toMatch(/practical checklists, worked examples and published sources/i);
    expect(editorialPolicy.disclosure).toMatch(/general application guidance/i);
    expect(editorialPolicy.disclosure).toMatch(/rather than individual career or legal advice/i);
    expect(editorialPolicy.approach).toMatch(/separate published source facts from our practical suggestions/i);
    expect(editorialPolicy.approach).toMatch(/worked examples illustrate the advice; they are not customer case studies/i);
    expect(editorialPolicy.approach).toMatch(/connected features depend on setup/i);
    expect(editorialPolicy.approach).toMatch(/in the CV Check you read every change before you download it/i);
  });

  it("returns no fabricated article for an unknown or missing slug", () => {
    expect(getCareerGuide("not-a-real-guide")).toBeUndefined();
    expect(getCareerGuide(undefined)).toBeUndefined();
  });

  it("dates the new non-AI guide at its first publication without redating existing guides", () => {
    expect(getCareerGuide("cv-check-without-ai")).toMatchObject({ publishedAt: "2026-11-04", updatedAt: "2026-11-04" });
    // Rewritten guides and guides with corrected citations carry the date of this update.
    const rewritten = ["cv-job-description-evidence", "cv-check-no-fit-percentage", "resume-privacy-before-upload", "achievements-without-numbers", "cv-upload-failure-checklist", "mba-career-pivot-cv", "role-filtering-before-applying", "first-application-pack", "reuse-second-application", "cv-pdf-or-docx"];
    for (const guide of careerGuides.filter(guide => guide.slug !== "cv-check-without-ai")) {
      expect(guide.publishedAt).toBe("2026-10-13");
      expect(guide.updatedAt).toBe(rewritten.includes(guide.slug) ? "2026-11-04" : "2026-10-14");
    }
  });
});
