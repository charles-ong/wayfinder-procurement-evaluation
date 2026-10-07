import { describe, expect, it } from "vitest";
import { DEFAULT_PROPORTIONALITY_FRAMEWORK } from "@wayfinder/domain";
import type { Requirement, RequirementAssessment } from "@wayfinder/domain";
import { renderReviewReportMarkdown } from "./render-review-report";
import type { RequirementReview } from "./review-requirements";
import { SAMPLE_PROFILE } from "./__fixtures__/sample-sor";

const requirement = (overrides: Partial<Requirement>): Requirement => ({
  id: "R1",
  documentId: "doc-sor",
  clauseRef: "3.1",
  text: "The Supplier must hold ISO 9001 certification.",
  sourceVerified: true,
  obligation: "mandatory",
  stage: "participation",
  linkedRisk: null,
  evidenceRequested: ["certification"],
  ...overrides,
});

const assessment = (requirementId: string, value: number): RequirementAssessment => ({
  requirementId,
  scores: {
    clarity: { score: value, rationale: "Clear enough." },
    consistency: { score: value, rationale: "Consistent." },
    duplication: { score: value, rationale: "Unique." },
    proportionality: { score: value, rationale: "Heavy for the tier." },
    accessibility: { score: value, rationale: "Certification costs SMEs." },
  },
});

const review = (overrides: Partial<RequirementReview> = {}): RequirementReview => ({
  profile: SAMPLE_PROFILE,
  tier: DEFAULT_PROPORTIONALITY_FRAMEWORK.tiers.basic,
  documents: [
    { documentId: "doc-sor", filename: "workshop-sor.docx", kind: "sor", requirementCount: 2, readable: true },
  ],
  requirements: [requirement({}), requirement({ id: "R2", clauseRef: "3.2", text: "Provide two referees.", obligation: "desirable", stage: "evaluation", evidenceRequested: ["referees"] })],
  assessments: [assessment("R1", 2), assessment("R2", 4)],
  findings: [
    {
      kind: "unnecessary_evidence",
      severity: "high",
      requirementIds: ["R1"],
      rationale: "Asks for certification.",
      origin: "rule",
    },
    {
      kind: "gold_plating",
      severity: "low",
      requirementIds: ["R2"],
      rationale: "Two referees is plenty.",
      origin: "model",
    },
  ],
  unassessedRequirementIds: [],
  mandatoryCriteriaCount: 1,
  ...overrides,
});

describe("renderReviewReportMarkdown", () => {
  it("summarises the procurement, the tier applied and the finding counts", () => {
    const markdown = renderReviewReportMarkdown(review());

    expect(markdown).toContain("# Requirement quality review");
    expect(markdown).toContain("| Estimated value | $60,000 (GST inclusive) |");
    expect(markdown).toContain("| Proportionality tier | Basic.");
    expect(markdown).toContain("workshop-sor.docx (Statement of Requirements, 2 requirements)");
    expect(markdown).toContain("| Findings | 1 high, 0 medium, 1 low |");
  });

  it("lists findings under their severity with the clause, the rationale and whether a rule or the AI raised them", () => {
    const markdown = renderReviewReportMarkdown(review());

    const high = markdown.indexOf("### High");
    const low = markdown.indexOf("### Low");
    expect(high).toBeGreaterThan(-1);
    expect(low).toBeGreaterThan(high);
    expect(markdown).toContain("**Unnecessary evidence request**: R1 (clause 3.1). Rule check.");
    expect(markdown).toContain("**Gold-plating**: R2 (clause 3.2). AI judgement.");
    expect(markdown).not.toContain("### Medium");
  });

  it("tabulates every requirement's scores and its finding count", () => {
    const markdown = renderReviewReportMarkdown(review());

    expect(markdown).toContain("| R1 | 3.1 | Mandatory | Participation | 2 | 2 | 2 | 2 | 2 | 1 |");
    expect(markdown).toContain("| R2 | 3.2 | Desirable | Evaluation | 4 | 4 | 4 | 4 | 4 | 1 |");
  });

  it("shows the average score for each dimension", () => {
    const markdown = renderReviewReportMarkdown(review());

    expect(markdown).toContain("| Clarity | 3.0 |");
  });

  it("warns when the mandatory criteria exceed what the tier treats as proportionate", () => {
    const markdown = renderReviewReportMarkdown(review({ mandatoryCriteriaCount: 8 }));

    expect(markdown).toContain("8 mandatory criteria is more than the 5 the Basic tier treats as proportionate");
  });

  it("calls out requirements it could not trace or score, and documents it could not read", () => {
    const markdown = renderReviewReportMarkdown(
      review({
        requirements: [requirement({ sourceVerified: false })],
        assessments: [],
        unassessedRequirementIds: ["R1"],
        documents: [
          { documentId: "doc-scan", filename: "scan.pdf", kind: "rfq", requirementCount: 0, readable: false },
        ],
      }),
    );

    expect(markdown).toContain("## Needs your attention");
    expect(markdown).toContain("R1 could not be matched word for word to its clause");
    expect(markdown).toContain("R1 was not scored");
    expect(markdown).toContain("scan.pdf has no readable text");
    expect(markdown).toContain("| R1 | 3.1 | Mandatory | Participation | – | – | – | – | – | 1 |");
  });

  it("leaves out the attention section when everything was traced, scored and read", () => {
    expect(renderReviewReportMarkdown(review())).not.toContain("Needs your attention");
  });
});
