import type { EvidenceKind, ProcurementProfile } from "./requirement-review";

export type ProportionalityTierName = "basic" | "standard" | "complex";

export interface ProportionalityTier {
  readonly name: ProportionalityTierName;
  readonly label: string;
  readonly description: string;
  // Evidence a buyer can ask for at this tier without having to justify it
  // against a stated risk. Anything else is flagged for the officer to defend.
  readonly proportionateEvidence: readonly EvidenceKind[];
  // Above this many mandatory criteria the approach is likely to shut out SMEs
  // and new entrants for no matching reduction in risk.
  readonly maxMandatoryCriteria: number;
}

export interface ProportionalityFramework {
  // A buy below this value (GST inclusive) can sit in the basic tier.
  readonly basicValueCeiling: number;
  // A buy at or above this value is complex whatever its risk.
  readonly complexValueFloor: number;
  readonly tiers: Readonly<Record<ProportionalityTierName, ProportionalityTier>>;
}

// Starting values for officers to tune. The basic ceiling mirrors the CPR
// procurement threshold for non-corporate Commonwealth entities ($80,000 for
// non-construction); the complex floor and the evidence lists are a starting
// position, not a rule, and the report says which tier it applied and why.
export const DEFAULT_PROPORTIONALITY_FRAMEWORK: ProportionalityFramework = {
  basicValueCeiling: 80_000,
  complexValueFloor: 1_000_000,
  tiers: {
    basic: {
      name: "basic",
      label: "Basic",
      description: "Low value and low risk. Ask only for what is needed to confirm the supplier can deliver.",
      proportionateEvidence: ["referees"],
      maxMandatoryCriteria: 5,
    },
    standard: {
      name: "standard",
      label: "Standard",
      description: "Moderate value or risk. Proportionate evidence of capability and insurance is reasonable.",
      proportionateEvidence: ["referees", "case_studies", "insurance_certificate", "personnel_cvs"],
      maxMandatoryCriteria: 10,
    },
    complex: {
      name: "complex",
      label: "Complex",
      description: "High value or high risk. Fuller assurance evidence can be justified.",
      proportionateEvidence: [
        "certification",
        "financial_statements",
        "insurance_certificate",
        "referees",
        "case_studies",
        "personnel_cvs",
        "policy_documents",
        "site_visit",
      ],
      maxMandatoryCriteria: 20,
    },
  },
};

export const resolveProportionalityTier = (
  profile: ProcurementProfile,
  framework: ProportionalityFramework,
): ProportionalityTier => {
  if (profile.riskTier === "high" || profile.estimatedValue >= framework.complexValueFloor) {
    return framework.tiers.complex;
  }
  if (profile.riskTier === "low" && profile.estimatedValue < framework.basicValueCeiling) {
    return framework.tiers.basic;
  }
  return framework.tiers.standard;
};

// Evidence is classified by rule rather than by the model so the officer can see
// exactly why a request was counted, and so a framework change re-runs without
// another model call.
const EVIDENCE_PATTERNS: ReadonlyArray<readonly [EvidenceKind, RegExp]> = [
  ["certification", /\b(?:ISO|AS\/NZS)\s?\d+|\bcertif(?:ied|ication)\b|\baccredit/i],
  ["financial_statements", /\bfinancial (?:statements|accounts|reports)\b|\bbalance sheets?\b/i],
  ["insurance_certificate", /\bcertificates? of currency\b|\binsurance\b/i],
  ["referees", /\breferees?\b|\breferences? from\b/i],
  ["case_studies", /\bcase stud(?:y|ies)\b|\bexamples? of (?:previous|similar|past) (?:work|projects|contracts)\b/i],
  ["personnel_cvs", /\bCVs?\b|\bcurricul(?:um|a) vitae\b|\brésumés?\b/],
  ["policy_documents", /\b(?:provide|submit|attach|copy of)\b[^.]*\bpolic(?:y|ies)\b/i],
  ["site_visit", /\bsite (?:visit|inspection)s?\b/i],
];

export const classifyEvidenceRequests = (text: string): EvidenceKind[] =>
  EVIDENCE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
