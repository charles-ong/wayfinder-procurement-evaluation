import { describe, expect, it } from "vitest";
import { mimeTypeForPath, parseReviewArguments } from "./review-requirements-arguments.js";

const required = ["--file", "sor:./workshop-sor.docx", "--value", "60000", "--risk", "low", "--category", "Workshop facilitation"];

describe("parseReviewArguments", () => {
  it("reads the documents, the procurement profile and the optional output paths", () => {
    const parsed = parseReviewArguments([
      ...required,
      "--file",
      "rft:./tender.pdf",
      "--out",
      "report.md",
      "--json",
      "review.json",
    ]);

    expect(parsed).toEqual({
      data: {
        files: [
          { kind: "sor", path: "./workshop-sor.docx" },
          { kind: "rft", path: "./tender.pdf" },
        ],
        profile: { estimatedValue: 60_000, riskTier: "low", category: "Workshop facilitation" },
        outPath: "report.md",
        jsonPath: "review.json",
      },
    });
  });

  it("accepts a value written with commas or a dollar sign", () => {
    const parsed = parseReviewArguments(["--file", "rfq:a.txt", "--value", "$1,250,000", "--risk", "high", "--category", "ICT"]);

    expect(parsed.data?.profile.estimatedValue).toBe(1_250_000);
  });

  it("rejects a file without a known document kind", () => {
    const parsed = parseReviewArguments(["--file", "contract:./a.docx", ...required.slice(2)]);

    expect(parsed.error).toContain("rfq, rft or sor");
  });

  it("rejects a missing or unreadable value and an unknown risk tier", () => {
    expect(parseReviewArguments(["--file", "sor:a.docx", "--risk", "low", "--category", "x"]).error).toContain("--value");
    expect(parseReviewArguments([...required.slice(0, 2), "--value", "lots", "--risk", "low", "--category", "x"]).error).toContain("--value");
    expect(parseReviewArguments([...required.slice(0, 4), "--risk", "extreme", "--category", "x"]).error).toContain("--risk");
  });

  it("requires at least one document and a category", () => {
    expect(parseReviewArguments(required.slice(2)).error).toContain("--file");
    expect(parseReviewArguments(required.slice(0, 6)).error).toContain("--category");
  });
});

describe("mimeTypeForPath", () => {
  it("maps the formats the document extractor reads", () => {
    expect(mimeTypeForPath("a.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(mimeTypeForPath("A.PDF")).toBe("application/pdf");
    expect(mimeTypeForPath("notes.txt")).toBe("text/plain");
    expect(mimeTypeForPath("notes.md")).toBe("text/markdown");
  });

  it("returns null for anything else", () => {
    expect(mimeTypeForPath("legacy.doc")).toBeNull();
  });
});
