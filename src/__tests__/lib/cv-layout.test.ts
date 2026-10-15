import { describe, expect, it } from "vitest";
import { layoutWords, parseCvLayout } from "@/lib/cv-layout";

const cv = `Priya Raman
Dubai, UAE | priya@example.com | +971 50 000 0000

PROFILE
Operations and strategy manager with 7 years in retail.

EXPERIENCE
Senior Manager, Strategy & Operations - Gulf Home Retail, Dubai | 2022 - present
- Led a 12-store replenishment redesign that cut stock-outs by 18%
• Ran a vendor consolidation that saved AED 2.1M a year

Education:
MBA, Example School, 2017
1. Numbered lines stay plain text`;

describe("CV layout reading", () => {
  it("classifies name, contact, headings, roles and bullets without changing wording", () => {
    const blocks = parseCvLayout(cv).filter(block => block.kind !== "blank");
    expect(blocks.map(block => block.kind)).toEqual(["name", "contact", "heading", "text", "heading", "role", "bullet", "bullet", "heading", "text", "text"]);
    expect(blocks[6].text).toBe("Led a 12-store replenishment redesign that cut stock-outs by 18%");
    expect(blocks[10].text).toBe("1. Numbered lines stay plain text");
  });
  it("keeps every word of the source in order", () => {
    const strip = (text: string) => text.replace(/^\s*[-•]\s+/gmu, "").replace(/\s+/gu, " ").trim();
    expect(layoutWords(parseCvLayout(cv))).toBe(strip(cv));
  });
  it("does not treat a first-line heading as a name", () => {
    expect(parseCvLayout("EXPERIENCE\nAnalyst at Example")[0].kind).toBe("heading");
  });
  it("does not call a sentence in capitals a heading when it ends with a full stop", () => {
    expect(parseCvLayout("Name\n\nLED THE TEAM.")[2].kind).toBe("text");
  });
});
