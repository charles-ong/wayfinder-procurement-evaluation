import { describe, expect, it } from "vitest";
import {
  FINDING_KINDS,
  FINDING_SEVERITIES,
  OBLIGATION_LEVELS,
  QUALITY_DIMENSIONS,
  REQUIREMENT_STAGES,
} from "@wayfinder/domain";
import { requirementAssessmentSchema, requirementExtractionSchema } from "@wayfinder/shared";

// @wayfinder/shared cannot import the domain, so its schemas restate the
// domain's value lists. This keeps a value added on one side from silently
// being rejected, or never offered, on the other.
describe("requirement review schemas", () => {
  const assessmentItem = requirementAssessmentSchema.shape.assessments.element;
  const findingItem = assessmentItem.shape.findings.element;

  it("offers the model exactly the domain's obligation levels", () => {
    expect(requirementExtractionSchema.shape.requirements.element.shape.obligation.options).toEqual([
      ...OBLIGATION_LEVELS,
    ]);
  });

  it("offers the model exactly the domain's requirement stages", () => {
    expect(requirementExtractionSchema.shape.requirements.element.shape.stage.options).toEqual([...REQUIREMENT_STAGES]);
  });

  it("asks the model for exactly the domain's quality dimensions", () => {
    const scoredKeys = Object.keys(assessmentItem.shape).filter((key) => key !== "requirementId" && key !== "findings");

    expect(scoredKeys).toEqual([...QUALITY_DIMENSIONS]);
  });

  it("offers the model exactly the domain's finding kinds and severities", () => {
    expect(findingItem.shape.kind.options).toEqual([...FINDING_KINDS]);
    expect(findingItem.shape.severity.options).toEqual([...FINDING_SEVERITIES]);
  });
});
