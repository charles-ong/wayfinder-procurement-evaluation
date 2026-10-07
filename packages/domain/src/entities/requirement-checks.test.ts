import { describe, expect, it } from "vitest";
import { DEFAULT_PROPORTIONALITY_FRAMEWORK } from "./proportionality-framework";
import {
  findDisproportionateEvidence,
  findRepeatedRequirements,
  findUndefinedAcronyms,
  findUnlinkedMandatoryCriteria,
  locateRequirementText,
} from "./requirement-checks";
import type { Requirement } from "./requirement-review";

const requirement = (overrides: Partial<Requirement>): Requirement => ({
  id: "R1",
  documentId: "doc-sor",
  clauseRef: "3.1",
  text: "The Supplier must provide a help desk.",
  sourceVerified: true,
  obligation: "desirable",
  stage: "participation",
  linkedRisk: null,
  evidenceRequested: [],
  ...overrides,
});

const { basic, complex } = DEFAULT_PROPORTIONALITY_FRAMEWORK.tiers;

describe("locateRequirementText", () => {
  it("is true only when the text occurs in the document exactly", () => {
    const documentText = "3.1 The Supplier must provide a help desk.\n3.2 Something else.";

    expect(locateRequirementText("The Supplier must provide a help desk.", documentText)).toBe(true);
    expect(locateRequirementText("The supplier must provide a helpdesk.", documentText)).toBe(false);
  });

  it("is false for empty text", () => {
    expect(locateRequirementText("", "anything")).toBe(false);
  });
});

describe("findRepeatedRequirements", () => {
  it("flags two requirements that say the same thing in nearly the same words", () => {
    const first = requirement({ id: "R1", text: "The Supplier must provide monthly performance reports to the Project Manager." });
    const second = requirement({ id: "R2", text: "The Supplier must provide monthly performance reports to the Project Manager in writing." });

    const findings = findRepeatedRequirements([first, second]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "duplicate",
      requirementIds: ["R2", "R1"],
      origin: "rule",
    });
  });

  it("rates an exact repeat as high severity", () => {
    const text = "The Supplier must hold public liability insurance of $10 million.";

    const findings = findRepeatedRequirements([requirement({ id: "R1", text }), requirement({ id: "R2", text })]);

    expect(findings[0]?.severity).toBe("high");
  });

  it("counts numbers as significant words", () => {
    const first = requirement({ id: "R1", text: "Report within 5 days of the workshop." });
    const second = requirement({ id: "R2", text: "Report within 10 days of the workshop." });

    expect(findRepeatedRequirements([first, second], 0.7)).toEqual([]);
  });

  it("calls two near-identical requirements with different figures a conflict, not a duplicate", () => {
    const first = requirement({ id: "R1", text: "The Supplier must provide a written report to the Contract Manager within 5 business days after each workshop." });
    const second = requirement({ id: "R2", text: "The Supplier must provide a written report to the Contract Manager within 10 business days after each workshop." });

    const findings = findRepeatedRequirements([first, second]);

    expect(findings).toEqual([
      expect.objectContaining({ kind: "conflict", severity: "high", requirementIds: ["R2", "R1"] }),
    ]);
    expect(findings[0]?.rationale).toContain("10 against 5");
  });

  it("does not flag requirements about different things", () => {
    const first = requirement({ id: "R1", text: "The Supplier must provide monthly performance reports." });
    const second = requirement({ id: "R2", text: "All staff must hold a current police check." });

    expect(findRepeatedRequirements([first, second])).toEqual([]);
  });
});

describe("findUndefinedAcronyms", () => {
  it("flags acronyms the documents never expand or define", () => {
    const flagged = requirement({ id: "R4", text: "The Supplier must meet the SLA and comply with the PSPF." });
    const documents = ["The Service Level Agreement (SLA) is at Schedule 2."];

    const findings = findUndefinedAcronyms([flagged], documents, []);

    expect(findings).toEqual([
      expect.objectContaining({ kind: "undefined_term", requirementIds: ["R4"], origin: "rule" }),
    ]);
    expect(findings[0]?.rationale).toContain("PSPF");
    expect(findings[0]?.rationale).not.toContain("SLA");
  });

  it("accepts acronyms defined in a definitions list or named as defined terms", () => {
    const flagged = requirement({ text: "The KPI and WHS obligations apply." });
    const documents = ["Definitions\nKPI means key performance indicator."];

    expect(findUndefinedAcronyms([flagged], documents, ["WHS"])).toEqual([]);
  });

  it("ignores capitalised modal verbs and common commercial acronyms", () => {
    const flagged = requirement({ text: "The Supplier MUST quote prices in AUD including GST and MUST NOT subcontract." });

    expect(findUndefinedAcronyms([flagged], [], [])).toEqual([]);
  });
});

describe("findUnlinkedMandatoryCriteria", () => {
  it("flags a mandatory requirement whose document states no risk it manages", () => {
    const unlinked = requirement({ id: "R2", obligation: "mandatory" });
    const linked = requirement({ id: "R3", obligation: "mandatory", linkedRisk: "Loss of personal information" });
    const desirable = requirement({ id: "R4" });

    const findings = findUnlinkedMandatoryCriteria([unlinked, linked, desirable]);

    expect(findings.map((finding) => finding.requirementIds)).toEqual([["R2"]]);
    expect(findings[0]?.kind).toBe("mandatory_not_risk_linked");
  });

  it("leaves contract delivery obligations alone, since they do not decide who can compete", () => {
    const deliveryObligation = requirement({ obligation: "mandatory", stage: "delivery" });
    const evaluationCriterion = requirement({ id: "R6", obligation: "mandatory", stage: "evaluation" });

    const findings = findUnlinkedMandatoryCriteria([deliveryObligation, evaluationCriterion]);

    expect(findings.map((finding) => finding.requirementIds)).toEqual([["R6"]]);
  });
});

describe("findDisproportionateEvidence", () => {
  it("flags evidence above what the tier calls proportionate", () => {
    const heavy = requirement({
      id: "R5",
      obligation: "mandatory",
      evidenceRequested: ["certification", "financial_statements", "referees"],
    });

    const findings = findDisproportionateEvidence([heavy], basic);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "unnecessary_evidence", severity: "high", requirementIds: ["R5"] });
    expect(findings[0]?.rationale).toContain("certification");
    expect(findings[0]?.rationale).not.toContain("referees");
  });

  it("lowers the severity when the document links the evidence to a stated risk", () => {
    const justified = requirement({
      obligation: "mandatory",
      linkedRisk: "Supplier insolvency during a multi-year contract",
      evidenceRequested: ["financial_statements"],
    });

    expect(findDisproportionateEvidence([justified], basic)[0]?.severity).toBe("low");
  });

  it("raises nothing when every evidence request is proportionate to the tier", () => {
    const heavy = requirement({ evidenceRequested: ["certification", "financial_statements"] });

    expect(findDisproportionateEvidence([heavy], complex)).toEqual([]);
  });
});
