import { describe, expect, it } from "vitest";
import { isValidDimensionScore, mergeFindings, type RequirementFinding } from "./requirement-review";

const finding = (overrides: Partial<RequirementFinding>): RequirementFinding => ({
  kind: "duplicate",
  severity: "medium",
  requirementIds: ["R1", "R2"],
  rationale: "rule rationale",
  origin: "rule",
  ...overrides,
});

describe("isValidDimensionScore", () => {
  it("accepts whole scores from 1 to 5", () => {
    expect([1, 2, 3, 4, 5].every(isValidDimensionScore)).toBe(true);
  });

  it("rejects scores outside the scale or with a fraction", () => {
    expect(isValidDimensionScore(0)).toBe(false);
    expect(isValidDimensionScore(6)).toBe(false);
    expect(isValidDimensionScore(3.5)).toBe(false);
  });
});

describe("mergeFindings", () => {
  it("keeps the rule finding when the model raises the same finding against the same requirements", () => {
    const ruleFinding = finding({});
    const modelFinding = finding({ origin: "model", requirementIds: ["R2", "R1"], rationale: "model rationale" });

    expect(mergeFindings([ruleFinding], [modelFinding])).toEqual([ruleFinding]);
  });

  it("adds model findings the rules did not raise", () => {
    const ruleFinding = finding({});
    const conflict = finding({ kind: "conflict", origin: "model" });
    const otherDuplicate = finding({ origin: "model", requirementIds: ["R3", "R4"] });

    expect(mergeFindings([ruleFinding], [conflict, otherDuplicate])).toEqual([
      ruleFinding,
      conflict,
      otherDuplicate,
    ]);
  });
});
