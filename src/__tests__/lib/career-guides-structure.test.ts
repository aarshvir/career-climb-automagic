import { describe, expect, it } from "vitest";
import { careerGuides } from "@/lib/career-guides";

// Guides rewritten on 3 Nov 2026 as answer-first pages, corrected after the second audit on 4 Nov 2026. Their updatedAt moves with the text; every other guide keeps the first-release date.
const rewritten = [
  "cv-job-description-evidence",
  "cv-check-no-fit-percentage",
  "resume-privacy-before-upload",
  "achievements-without-numbers",
  "cv-upload-failure-checklist",
  "mba-career-pivot-cv",
];
const REWRITE_DATE = "2026-11-04";
// First written on 3 Nov 2026 (after the library's first release), so its published date is its own.
const NEW_GUIDE = { slug: "cv-check-without-ai", publishedAt: "2026-11-04", updatedAt: "2026-11-04" };

describe("answer-first guide structure", () => {
  it("dates only the guides whose text changed", () => {
    for (const guide of careerGuides) {
      if (guide.slug === NEW_GUIDE.slug) continue;
      expect(guide.updatedAt, guide.slug).toBe(rewritten.includes(guide.slug) ? REWRITE_DATE : "2026-10-14");
      expect(guide.publishedAt, guide.slug).toBe("2026-10-13");
    }
  });

  it("gives the guide added on 3 Nov 2026 its real publication and update dates", () => {
    const guide = careerGuides.find(item => item.slug === NEW_GUIDE.slug)!;
    expect(guide.publishedAt).toBe(NEW_GUIDE.publishedAt);
    expect(guide.updatedAt).toBe(NEW_GUIDE.updatedAt);
  });

  it.each(rewritten)("%s opens with an answer, has a question-and-answer block and well-formed tables", slug => {
    const guide = careerGuides.find(item => item.slug === slug)!;
    const words = guide.summary.trim().split(/\s+/).length;
    expect(words, "summary is the answer capsule").toBeGreaterThanOrEqual(35);
    expect(words, "summary is the answer capsule").toBeLessThanOrEqual(80);
    expect(guide.description.length).toBeGreaterThanOrEqual(80);
    expect(guide.description.length).toBeLessThanOrEqual(160);
    expect(guide.faqs?.length, "faq count").toBeGreaterThanOrEqual(3);
    expect(guide.faqs?.length, "faq count").toBeLessThanOrEqual(5);
    expect(new Set(guide.faqs?.map(faq => faq.q)).size).toBe(guide.faqs?.length);
    for (const faq of guide.faqs ?? []) {
      expect(faq.q.endsWith("?"), faq.q).toBe(true);
      const answerWords = faq.a.trim().split(/\s+/).length;
      expect(answerWords, faq.q).toBeGreaterThanOrEqual(25);
      expect(answerWords, faq.q).toBeLessThanOrEqual(100);
      expect(faq.a, faq.q).not.toMatch(/[<>]|https?:\/\/|\*\*/);
    }
    const tables = guide.sections.flatMap(section => (section.table ? [section.table] : []));
    expect(tables.length, "each rewritten guide carries a table").toBeGreaterThanOrEqual(1);
    for (const table of tables) {
      expect(table.caption.length).toBeGreaterThan(10);
      expect(table.head.length).toBeGreaterThanOrEqual(2);
      expect(table.rows.length).toBeGreaterThanOrEqual(3);
      expect(new Set(table.rows.map(row => row[0])).size, "row labels are unique").toBe(table.rows.length);
      for (const row of table.rows) {
        expect(row.length).toBe(table.head.length);
        for (const cell of row) expect(cell.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// Owner copy and truth rules apply to the guide text itself, including the new faqs and tables.
describe("guide copy rules", () => {
  const text = JSON.stringify(careerGuides).replace(/Automated Job Loop/g, "AUTOMATED");
  const banned: [string, RegExp][] = [
    ["deterrent: nothing is sent", /nothing is sent(?! to an AI provider)/i],
    ["deterrent: apply yourself", /you apply yourself|apply yourself/i],
    ["deterrent: never applies", /never applies|does not apply for you|doesn.t apply for you/i],
    ["deterrent: submit on the employer", /submit on the employer/i],
    ["absolute: guaranteed", /guaranteed ats|guaranteed (job|interview)s?\b(?!\.)/i],
    ["absolute: every role you target", /every role you target/i],
    ["bare Job Loop", /(^|[^d] )Job Loop\b/],
    ["no sign-up claim", /no sign-?up|no account|without an account|without creating an account/i],
    ["absolute: cannot invent", /cannot invent|can't invent|can not invent/i],
    ["hero wording", /built for a high ATS match/i],
    ["testimonial, count or rating", /testimonial|\b\d[\d,]*\+? (users|customers|job seekers|members)\b|rated \d|\d(\.\d)?\/5 stars/i],
    ["fit score for Jobvance", /jobvance (gives|shows|returns|calculates) (you )?(a|an) (match|fit|ats) (score|percentage)/i],
  ];
  it.each(banned)("%s is absent from every guide", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });
});
