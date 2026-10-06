import { describe, expect, it, vi } from "vitest";
import { domainError, err, ok } from "@wayfinder/domain";
import type { GenerateObjectInput, ILanguageModel, ProcurementSourceDocument } from "@wayfinder/domain";
import type { RequirementAssessmentData } from "@wayfinder/shared";
import { reviewRequirements } from "./review-requirements";
import { SAMPLE_PROFILE, SAMPLE_SOR, SAMPLE_SOR_EXTRACTION } from "./__fixtures__/sample-sor";

const usage = { promptTokens: 1, completionTokens: 1, systemTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const score = (value: number) => ({ score: value, rationale: `scored ${value}` });

const assessment = (
  requirementId: string,
  findings: RequirementAssessmentData["assessments"][number]["findings"] = [],
): RequirementAssessmentData["assessments"][number] => ({
  requirementId,
  clarity: score(4),
  consistency: score(4),
  duplication: score(4),
  proportionality: score(4),
  accessibility: score(4),
  findings,
});

const SAMPLE_ASSESSMENT: RequirementAssessmentData = {
  assessments: [
    assessment("R1"),
    assessment("R2"),
    assessment("R3", [
      {
        kind: "gold_plating",
        severity: "medium",
        relatedRequirementIds: [],
        rationale: "Ten Commonwealth workshops in two years excludes capable new entrants.",
      },
    ]),
    assessment("R4"),
    assessment("R5"),
    // The rule check already raises this conflict; the merge keeps one copy.
    assessment("R6", [{ kind: "conflict", severity: "high", relatedRequirementIds: ["R5"], rationale: "model" }]),
    assessment("R7"),
    assessment("R8"),
    assessment("R9"),
  ],
};

const scriptedModel = (): ILanguageModel => {
  const generateObject = vi.fn(async (input: GenerateObjectInput) => {
    const object = input.purpose === "requirementExtraction" ? SAMPLE_SOR_EXTRACTION : SAMPLE_ASSESSMENT;
    return ok({ object, usage, provider: "anthropic", model: "test" });
  });
  return { provider: "anthropic", generateObject } as unknown as ILanguageModel;
};

describe("reviewRequirements", () => {
  it("extracts, checks and scores a sample SOR against the basic tier", async () => {
    const result = await reviewRequirements(scriptedModel(), {
      documents: [SAMPLE_SOR],
      profile: SAMPLE_PROFILE,
    });

    expect(result.error).toBeUndefined();
    const review = result.data!;
    expect(review.tier.name).toBe("basic");
    expect(review.requirements.map((requirement) => requirement.clauseRef)).toEqual([
      "3.1", "3.2", "3.3", "3.4", "4.1", "4.2", "4.3", "4.4", "4.5",
    ]);
    expect(review.requirements.every((requirement) => requirement.sourceVerified)).toBe(true);
    expect(review.mandatoryCriteriaCount).toBe(4);
    expect(review.assessments).toHaveLength(9);
    expect(review.documents).toEqual([
      { documentId: "doc-sor", filename: "workshop-facilitation-sor.docx", kind: "sor", requirementCount: 9, readable: true },
    ]);

    const raised = review.findings.map((finding) => `${finding.kind}:${finding.requirementIds.join("+")}:${finding.origin}`);
    expect(raised).toEqual(
      expect.arrayContaining([
        "conflict:R6+R5:rule",
        "duplicate:R8+R5:rule",
        "undefined_term:R4:rule",
        "unnecessary_evidence:R1:rule",
        "unnecessary_evidence:R2:rule",
        "mandatory_not_risk_linked:R1:rule",
        "mandatory_not_risk_linked:R4:rule",
        "gold_plating:R3:model",
      ]),
    );
    expect(raised).not.toContain("conflict:R6+R5:model");
    expect(raised).not.toContain("mandatory_not_risk_linked:R5:rule");
    expect(raised).not.toContain("mandatory_not_risk_linked:R9:rule");
  });

  it("orders findings by severity, then by where the requirement sits in the documents", async () => {
    const result = await reviewRequirements(scriptedModel(), { documents: [SAMPLE_SOR], profile: SAMPLE_PROFILE });

    const severities = result.data!.findings.map((finding) => finding.severity);
    const firstMedium = severities.indexOf("medium");
    expect(severities.slice(0, firstMedium).every((severity) => severity === "high")).toBe(true);
    expect(result.data!.findings[0]?.requirementIds[0]).toBe("R1");
  });

  it("reports a document with no readable text without sending it to the model", async () => {
    const scanned: ProcurementSourceDocument = { documentId: "doc-scan", filename: "scan.pdf", kind: "rfq", text: "  \n " };
    const model = scriptedModel();

    const result = await reviewRequirements(model, { documents: [scanned], profile: SAMPLE_PROFILE });

    expect(model.generateObject).not.toHaveBeenCalled();
    expect(result.data?.documents).toEqual([
      { documentId: "doc-scan", filename: "scan.pdf", kind: "rfq", requirementCount: 0, readable: false },
    ]);
    expect(result.data?.requirements).toEqual([]);
  });

  it("numbers requirements on across documents", async () => {
    const second: ProcurementSourceDocument = { ...SAMPLE_SOR, documentId: "doc-rft", filename: "rft.docx", kind: "rft" };

    const result = await reviewRequirements(scriptedModel(), { documents: [SAMPLE_SOR, second], profile: SAMPLE_PROFILE });

    const ids = result.data!.requirements.map((requirement) => requirement.id);
    expect(ids[0]).toBe("R1");
    expect(ids[9]).toBe("R10");
    expect(result.data!.requirements[9]?.documentId).toBe("doc-rft");
  });

  it("rejects a review with no documents", async () => {
    const result = await reviewRequirements(scriptedModel(), { documents: [], profile: SAMPLE_PROFILE });

    expect(result.error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an estimated value that is negative or not a number", async () => {
    for (const estimatedValue of [-1, Number.NaN]) {
      const result = await reviewRequirements(scriptedModel(), {
        documents: [SAMPLE_SOR],
        profile: { ...SAMPLE_PROFILE, estimatedValue },
      });

      expect(result.error?.code).toBe("VALIDATION_FAILED");
    }
  });

  it("returns the model's error when extraction fails", async () => {
    const failure = domainError("AI_PROVIDER_FAILED", "provider down");
    const model = { provider: "anthropic", generateObject: vi.fn().mockResolvedValue(err(failure)) } as unknown as ILanguageModel;

    const result = await reviewRequirements(model, { documents: [SAMPLE_SOR], profile: SAMPLE_PROFILE });

    expect(result.error).toBe(failure);
  });
});
