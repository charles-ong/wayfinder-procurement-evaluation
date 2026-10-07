import { describe, expect, it } from "vitest";
import { removePageFurniture, splitIntoSections } from "./procurement-text";

const page = (number: number, body: string): string =>
  `GovCMS Panel\nRequest for Tender - Statement of Requirements\n${number}\n${body}\n\n-- ${number} of 3 --\n`;

describe("removePageFurniture", () => {
  it("removes running headers, page numbers and page markers so a clause reads straight across a page break", () => {
    const text = [
      page(1, "4. Standards\na) The Contractor must ensure all Services"),
      page(2, "comply with best industry practice.\nb) The Contractor must report monthly."),
      page(3, "5. Personnel"),
    ].join("\n");

    const cleaned = removePageFurniture(text);

    expect(cleaned).not.toContain("GovCMS Panel");
    expect(cleaned).not.toContain("Request for Tender - Statement of Requirements");
    expect(cleaned).not.toContain("-- 2 of 3 --");
    expect(cleaned).toMatch(/must ensure all Services\s+comply with best industry practice\./);
  });

  it("keeps a line that only looks like a header because it repeats in the body", () => {
    const text = [page(1, "Note: see clause 4."), page(2, "Note: see clause 4."), page(3, "End.")].join("\n");

    expect(removePageFurniture(text).match(/Note: see clause 4\./g)).toHaveLength(2);
  });

  it("leaves text with no page markers untouched", () => {
    const text = "1. Overview\na) The Supplier must hold insurance.";

    expect(removePageFurniture(text)).toBe(text);
  });
});

describe("splitIntoSections", () => {
  const sectionOne = `1. Overview\n${"a) The Supplier must do the first thing.\n".repeat(5)}`;
  const sectionTwo = `2. Services\n${"a) The Supplier must do the second thing.\n".repeat(5)}`;
  const sectionThree = `3. Reporting\n${"a) The Supplier must do the third thing.\n".repeat(5)}`;

  it("returns a short document as one part", () => {
    const text = sectionOne + sectionTwo;

    expect(splitIntoSections(text, 10_000)).toEqual([text]);
  });

  it("splits at numbered top-level headings, packing whole sections into each part", () => {
    const parts = splitIntoSections(sectionOne + sectionTwo + sectionThree, sectionOne.length + sectionTwo.length);

    expect(parts).toEqual([sectionOne + sectionTwo, sectionThree]);
  });

  it("splits a single section longer than the limit at line breaks, never inside a line", () => {
    const parts = splitIntoSections(sectionOne, 100);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(sectionOne);
    for (const part of parts) expect(part.endsWith("\n")).toBe(true);
  });

  it("does not treat a numbered sub-clause or a number inside a sentence as a top-level heading", () => {
    const text = `1. Overview\n1.1. Detail\nThe fee is\n2. per cent of value.\n`;

    expect(splitIntoSections(text, 30).every((part) => !part.startsWith("1.1."))).toBe(true);
  });
});
