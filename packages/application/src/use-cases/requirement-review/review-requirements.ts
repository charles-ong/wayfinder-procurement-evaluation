import {
  DEFAULT_PROPORTIONALITY_FRAMEWORK,
  domainError,
  err,
  findDisproportionateEvidence,
  findRepeatedRequirements,
  findUndefinedAcronyms,
  findUnlinkedMandatoryCriteria,
  mergeFindings,
  ok,
  resolveProportionalityTier,
  type FindingSeverity,
  type ILanguageModel,
  type ProcurementDocumentKind,
  type ProcurementProfile,
  type ProcurementSourceDocument,
  type ProportionalityFramework,
  type ProportionalityTier,
  type Requirement,
  type RequirementAssessment,
  type RequirementFinding,
  type Result,
} from "@wayfinder/domain";
import { assessRequirements, type RequirementAssessmentOutcome } from "./assess-requirements";
import { extractRequirements } from "./extract-requirements";

export interface ReviewRequirementsInput {
  documents: readonly ProcurementSourceDocument[];
  profile: ProcurementProfile;
  framework?: ProportionalityFramework;
  userId?: string | null;
}

export interface ReviewedDocument {
  documentId: string;
  filename: string;
  kind: ProcurementDocumentKind;
  requirementCount: number;
  // False when the document had no text to read, e.g. a scan with no text layer.
  readable: boolean;
}

export interface RequirementReview {
  profile: ProcurementProfile;
  tier: ProportionalityTier;
  documents: ReviewedDocument[];
  requirements: Requirement[];
  assessments: RequirementAssessment[];
  findings: RequirementFinding[];
  unassessedRequirementIds: string[];
  // Mandatory participation conditions and evaluation criteria: the pass/fail
  // gates a supplier faces before award.
  mandatoryCriteriaCount: number;
}

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = { high: 0, medium: 1, low: 2 };

const sortFindings = (findings: RequirementFinding[], requirements: readonly Requirement[]): RequirementFinding[] => {
  const position = new Map(requirements.map((requirement, index) => [requirement.id, index]));
  const positionOf = (finding: RequirementFinding): number => position.get(finding.requirementIds[0] ?? "") ?? 0;
  return [...findings].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || positionOf(left) - positionOf(right),
  );
};

const validateInput = (input: ReviewRequirementsInput): Result<true> => {
  if (input.documents.length === 0) {
    return err(domainError("VALIDATION_FAILED", "Add at least one RFQ, RFT or SOR to review."));
  }
  const { estimatedValue } = input.profile;
  if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
    return err(domainError("VALIDATION_FAILED", "The estimated value must be a dollar amount of zero or more."));
  }
  return ok(true);
};

const NO_ASSESSMENT: RequirementAssessmentOutcome = { assessments: [], findings: [], unassessedRequirementIds: [] };

export const reviewRequirements = async (
  languageModel: ILanguageModel,
  input: ReviewRequirementsInput,
): Promise<Result<RequirementReview>> => {
  const validation = validateInput(input);
  if (validation.error) return validation;

  const tier = resolveProportionalityTier(input.profile, input.framework ?? DEFAULT_PROPORTIONALITY_FRAMEWORK);
  const requirements: Requirement[] = [];
  const definedTerms: string[] = [];
  const documents: ReviewedDocument[] = [];

  for (const document of input.documents) {
    const summary = { documentId: document.documentId, filename: document.filename, kind: document.kind };
    if (document.text.trim().length === 0) {
      documents.push({ ...summary, requirementCount: 0, readable: false });
      continue;
    }
    const extracted = await extractRequirements(languageModel, {
      document,
      firstRequirementNumber: requirements.length + 1,
      userId: input.userId,
    });
    if (extracted.error) return extracted;
    requirements.push(...extracted.data.requirements);
    definedTerms.push(...extracted.data.definedTerms);
    documents.push({ ...summary, requirementCount: extracted.data.requirements.length, readable: true });
  }

  const ruleFindings = [
    ...findRepeatedRequirements(requirements),
    ...findUndefinedAcronyms(requirements, input.documents.map((document) => document.text), definedTerms),
    ...findUnlinkedMandatoryCriteria(requirements),
    ...findDisproportionateEvidence(requirements, tier),
  ];

  const assessed =
    requirements.length === 0
      ? ok(NO_ASSESSMENT)
      : await assessRequirements(languageModel, {
          requirements,
          profile: input.profile,
          tier,
          ruleFindings,
          userId: input.userId,
        });
  if (assessed.error) return assessed;

  return ok({
    profile: input.profile,
    tier,
    documents,
    requirements,
    assessments: assessed.data.assessments,
    findings: sortFindings(mergeFindings(ruleFindings, assessed.data.findings), requirements),
    unassessedRequirementIds: assessed.data.unassessedRequirementIds,
    mandatoryCriteriaCount: requirements.filter(
      (requirement) => requirement.obligation === "mandatory" && requirement.stage !== "delivery",
    ).length,
  });
};
