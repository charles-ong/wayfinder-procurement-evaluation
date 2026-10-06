// The buyer requirement quality review: a procurement officer's RFQ, RFT or SOR
// broken into atomic requirements, each scored and flagged against a
// risk-value proportionality framework.

export const PROCUREMENT_DOCUMENT_KINDS = ["rfq", "rft", "sor"] as const;
export type ProcurementDocumentKind = (typeof PROCUREMENT_DOCUMENT_KINDS)[number];

export const RISK_TIERS = ["low", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export interface ProcurementProfile {
  // Whole dollars, GST inclusive, matching how the CPR thresholds are stated.
  readonly estimatedValue: number;
  readonly riskTier: RiskTier;
  readonly category: string;
}

export const OBLIGATION_LEVELS = ["mandatory", "desirable", "informational"] as const;
export type ObligationLevel = (typeof OBLIGATION_LEVELS)[number];

// Where in the procurement a requirement bites. Participation conditions and
// evaluation criteria decide who can compete and win; delivery obligations bind
// only the supplier who is awarded the contract.
export const REQUIREMENT_STAGES = ["participation", "evaluation", "delivery"] as const;
export type RequirementStage = (typeof REQUIREMENT_STAGES)[number];

export const EVIDENCE_KINDS = [
  "certification",
  "financial_statements",
  "insurance_certificate",
  "referees",
  "case_studies",
  "personnel_cvs",
  "policy_documents",
  "site_visit",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface ProcurementSourceDocument {
  readonly documentId: string;
  readonly filename: string;
  readonly kind: ProcurementDocumentKind;
  readonly text: string;
}

export interface Requirement {
  // Stable within one review ("R1", "R2", …) so the model and the report can
  // name a requirement without quoting it.
  readonly id: string;
  readonly documentId: string;
  readonly clauseRef: string;
  readonly text: string;
  // False when the text the model returned does not occur in the source
  // document byte for byte. The requirement is still reviewed, but the report
  // says it could not be traced to a clause.
  readonly sourceVerified: boolean;
  readonly obligation: ObligationLevel;
  readonly stage: RequirementStage;
  // The risk the document itself says this requirement manages; null when the
  // document states none.
  readonly linkedRisk: string | null;
  readonly evidenceRequested: readonly EvidenceKind[];
}

export const QUALITY_DIMENSIONS = [
  "clarity",
  "consistency",
  "duplication",
  "proportionality",
  "accessibility",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export const QUALITY_DIMENSION_LABELS: Readonly<Record<QualityDimension, string>> = {
  clarity: "Clarity",
  consistency: "Consistency",
  duplication: "Duplication",
  proportionality: "Proportionality to value/risk",
  accessibility: "SME and new-entrant accessibility",
};

export const MIN_DIMENSION_SCORE = 1;
export const MAX_DIMENSION_SCORE = 5;

export interface DimensionScore {
  // 1 (serious problem) to 5 (no concern).
  readonly score: number;
  readonly rationale: string;
}

export type RequirementScores = Readonly<Record<QualityDimension, DimensionScore>>;

export const FINDING_KINDS = [
  "conflict",
  "duplicate",
  "gold_plating",
  "unnecessary_evidence",
  "undefined_term",
  "mandatory_not_risk_linked",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_KIND_LABELS: Readonly<Record<FindingKind, string>> = {
  conflict: "Conflicting requirements",
  duplicate: "Duplicated requirement",
  gold_plating: "Gold-plating",
  unnecessary_evidence: "Unnecessary evidence request",
  undefined_term: "Undefined procurement term",
  mandatory_not_risk_linked: "Mandatory criterion not linked to risk",
};

export const FINDING_SEVERITIES = ["low", "medium", "high"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

// Deterministic findings come from rules the officer can inspect; model
// findings carry the model's judgement and must be read as such.
export type FindingOrigin = "rule" | "model";

export interface RequirementFinding {
  readonly kind: FindingKind;
  readonly severity: FindingSeverity;
  // The first id is the requirement the finding is filed against; any others
  // are the requirements it conflicts with or duplicates.
  readonly requirementIds: readonly string[];
  readonly rationale: string;
  readonly origin: FindingOrigin;
}

export interface RequirementAssessment {
  readonly requirementId: string;
  readonly scores: RequirementScores;
}

export const isValidDimensionScore = (score: number): boolean =>
  Number.isInteger(score) && score >= MIN_DIMENSION_SCORE && score <= MAX_DIMENSION_SCORE;

// Two findings are the same when they name the same kind against the same
// requirements, whichever order the related ids were listed in; the rule
// version wins over the model's because its reasoning is inspectable.
const findingKey = (finding: RequirementFinding): string =>
  [finding.kind, ...[...finding.requirementIds].sort()].join("|");

export const mergeFindings = (
  ruleFindings: readonly RequirementFinding[],
  modelFindings: readonly RequirementFinding[],
): RequirementFinding[] => {
  const seen = new Set(ruleFindings.map(findingKey));
  const additional = modelFindings.filter((finding) => !seen.has(findingKey(finding)));
  return [...ruleFindings, ...additional];
};
