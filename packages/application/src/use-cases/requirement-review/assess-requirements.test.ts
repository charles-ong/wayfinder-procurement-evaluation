import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROPORTIONALITY_FRAMEWORK, domainError, err, ok } from "@wayfinder/domain";
import type { ILanguageModel, Requirement, RequirementFinding } from "@wayfinder/domain";
import type { RequirementAssessmentData } from "@wayfinder/shared";
import { assessRequirements } from "./assess-requirements";
import { SAMPLE_PROFILE } from "./__fixtures__/sample-sor";

const usage = { promptTokens: 1, completionTokens: 1, systemTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const modelReturning = (...objects: RequirementAssessmentData[]): ILanguageModel => {
  const generateObject = vi.fn();
  for (const object of objects) {
    generateObject.mockResolvedValueOnce(ok({ object, usage, provider: "anthropic", model: "test" }));
  }
  return { provider: "anthropic", generateObject } as unknown as ILanguageModel;
};

const requirement = (id: string, text: string): Requirement => ({
  id,
  documentId: "doc-sor",
  clauseRef: "",
  text,
  sourceVerified: true,
  obligation: "mandatory",
  stage: "participation",
  linkedRisk: null,
  evidenceRequested: [],
});

const score = (value: number) => ({ score: value, rationale: `scored ${value}` });

const assessment = (
  requirementId: string,
  findings: RequirementAssessmentData["assessments"][number]["findings"] = [],
): RequirementAssessmentData["assessments"][number] => ({
  requirementId,
  clarity: score(4),
  consistency: score(3),
  duplication: score(5),
  proportionality: score(2),
  accessibility: score(1),
  findings,
});

const tier = DEFAULT_PROPORTIONALITY_FRAMEWORK.tiers.basic;
const fiveDays = requirement("R1", "Report within 5 business days.");
const tenDays = requirement("R2", "Report within 10 business days.");

describe("assessRequirements", () => {
  it("returns each requirement's five scores and files model findings against it and the requirements it names", async () => {
    const model = modelReturning({
      assessments: [
        assessment("R1"),
        assessment("R2", [
          { kind: "conflict", severity: "high", relatedRequirementIds: ["R1"], rationale: "5 vs 10 days." },
        ]),
      ],
    });

    const result = await assessRequirements(model, {
      requirements: [fiveDays, tenDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [],
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.assessments).toEqual([
      {
        requirementId: "R1",
        scores: {
          clarity: score(4),
          consistency: score(3),
          duplication: score(5),
          proportionality: score(2),
          accessibility: score(1),
        },
      },
      expect.objectContaining({ requirementId: "R2" }),
    ]);
    expect(result.data?.findings).toEqual([
      { kind: "conflict", severity: "high", requirementIds: ["R2", "R1"], rationale: "5 vs 10 days.", origin: "model" },
    ]);
    expect(result.data?.unassessedRequirementIds).toEqual([]);
  });

  it("drops related ids the model invented and ignores assessments of unknown requirements", async () => {
    const model = modelReturning({
      assessments: [
        assessment("R1", [
          { kind: "duplicate", severity: "low", relatedRequirementIds: ["R99", "R1"], rationale: "x" },
        ]),
        assessment("R2"),
        assessment("R77"),
      ],
    });

    const result = await assessRequirements(model, {
      requirements: [fiveDays, tenDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [],
    });

    expect(result.data?.findings[0]?.requirementIds).toEqual(["R1"]);
    expect(result.data?.assessments.map((item) => item.requirementId)).toEqual(["R1", "R2"]);
  });

  it("reports a requirement the model skipped or scored off the scale as unassessed", async () => {
    const offScale = { ...assessment("R2"), clarity: score(9) };
    const model = modelReturning({ assessments: [offScale] });

    const result = await assessRequirements(model, {
      requirements: [fiveDays, tenDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [],
    });

    expect(result.data?.assessments).toEqual([]);
    expect(result.data?.unassessedRequirementIds).toEqual(["R1", "R2"]);
  });

  it("assesses in batches but shows every batch the whole requirement set, so conflicts across batches are visible", async () => {
    const model = modelReturning({ assessments: [assessment("R1")] }, { assessments: [assessment("R2")] });

    const result = await assessRequirements(model, {
      requirements: [fiveDays, tenDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [],
      batchSize: 1,
    });

    const prompts = vi.mocked(model.generateObject).mock.calls.map(([call]) => call.prompt ?? "");
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("Report within 5 business days.");
      expect(prompt).toContain("Report within 10 business days.");
    }
    expect(prompts[0]).toContain("Assess only: R1");
    expect(prompts[1]).toContain("Assess only: R2");
    expect(result.data?.assessments).toHaveLength(2);
  });

  it("tells the model the tier, the profile and what the rule checks already found", async () => {
    const ruleFinding: RequirementFinding = {
      kind: "mandatory_not_risk_linked",
      severity: "medium",
      requirementIds: ["R1"],
      rationale: "No risk stated.",
      origin: "rule",
    };
    const model = modelReturning({ assessments: [assessment("R1")] });

    await assessRequirements(model, {
      requirements: [fiveDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [ruleFinding],
    });

    const call = vi.mocked(model.generateObject).mock.calls[0]?.[0];
    expect(call?.purpose).toBe("requirementAssessment");
    expect(call?.prompt).toContain("Basic");
    expect(call?.prompt).toContain("$60,000");
    expect(call?.prompt).toContain("R1: Mandatory criterion not linked to risk");
  });

  it("returns the model's error unchanged", async () => {
    const failure = domainError("AI_PROVIDER_FAILED", "provider down");
    const model = {
      provider: "anthropic",
      generateObject: vi.fn().mockResolvedValue(err(failure)),
    } as unknown as ILanguageModel;

    const result = await assessRequirements(model, {
      requirements: [fiveDays],
      profile: SAMPLE_PROFILE,
      tier,
      ruleFindings: [],
    });

    expect(result.error).toBe(failure);
  });
});
