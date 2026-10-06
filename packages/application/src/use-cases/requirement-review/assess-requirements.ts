import {
  FINDING_KIND_LABELS,
  QUALITY_DIMENSIONS,
  isValidDimensionScore,
  ok,
  type ILanguageModel,
  type ProcurementProfile,
  type ProportionalityTier,
  type Requirement,
  type RequirementAssessment,
  type RequirementFinding,
  type Result,
} from "@wayfinder/domain";
import { requirementAssessmentSchema, type RequirementAssessmentData } from "@wayfinder/shared";
import { formatAud } from "./review-format";

export const DEFAULT_ASSESSMENT_BATCH_SIZE = 20;

export interface AssessRequirementsInput {
  requirements: readonly Requirement[];
  profile: ProcurementProfile;
  tier: ProportionalityTier;
  ruleFindings: readonly RequirementFinding[];
  batchSize?: number;
  userId?: string | null;
}

export interface RequirementAssessmentOutcome {
  assessments: RequirementAssessment[];
  // Model findings only; the caller merges them with the rule findings.
  findings: RequirementFinding[];
  // Requirements the model skipped or scored off the scale. The report lists
  // them rather than showing a score nobody produced.
  unassessedRequirementIds: string[];
}

type ModelAssessment = RequirementAssessmentData["assessments"][number];

const SYSTEM_PROMPT = `<role>
  You are a senior Australian Government procurement adviser reviewing a buyer's requirements before they go to market. Your aim is requirements that are clear, consistent, free of duplication, proportionate to the value and risk of the procurement, and open to small and medium enterprises and new entrants.
</role>

<scoring>
  Score every requirement you are asked to assess from 1 (serious problem) to 5 (no concern) on:
  - clarity: a supplier could tell exactly what is required and how compliance is judged. Vague words ("appropriate", "high quality", "as required") and undefined terms lower the score.
  - consistency: it agrees with every other requirement in the set. A different number, deadline or standard for the same thing is a conflict.
  - duplication: it is not already required elsewhere in the set.
  - proportionality: what it demands is justified by the value and risk of this procurement and the stated tier.
  - accessibility: a capable SME or new entrant could meet it. Track-record minimums, Commonwealth-only experience, costly certifications and heavy submission burdens lower the score.
</scoring>

<findings>
  Raise a finding only for a real problem, using these kinds: conflict, duplicate, gold_plating (asks for more than the need requires), unnecessary_evidence, undefined_term, mandatory_not_risk_linked. For conflict and duplicate, name the other requirement ids. Rule checks have already run; do not repeat a rule finding, but you may add what they could not see.
</findings>`;

const describeRuleFindings = (ruleFindings: readonly RequirementFinding[]): string => {
  if (ruleFindings.length === 0) return "None.";
  return ruleFindings
    .map((finding) => `- ${finding.requirementIds[0]}: ${FINDING_KIND_LABELS[finding.kind]}. ${finding.rationale}`)
    .join("\n");
};

const buildPrompt = (input: AssessRequirementsInput, batch: readonly Requirement[]): string => {
  const allRequirements = input.requirements
    .map((requirement) => `${requirement.id} [${requirement.obligation}, ${requirement.stage}]: ${requirement.text}`)
    .join("\n");
  return `<procurement>
  Category: ${input.profile.category}
  Estimated value: ${formatAud(input.profile.estimatedValue)} (GST inclusive)
  Risk: ${input.profile.riskTier}
  Proportionality tier: ${input.tier.label}. ${input.tier.description}
</procurement>

<requirements>
${allRequirements}
</requirements>

<rule_findings>
${describeRuleFindings(input.ruleFindings)}
</rule_findings>

Assess only: ${batch.map((requirement) => requirement.id).join(", ")}`;
};

const hasValidScores = (item: ModelAssessment): boolean =>
  QUALITY_DIMENSIONS.every((dimension) => isValidDimensionScore(item[dimension].score));

const toAssessment = (item: ModelAssessment): RequirementAssessment => ({
  requirementId: item.requirementId,
  scores: {
    clarity: item.clarity,
    consistency: item.consistency,
    duplication: item.duplication,
    proportionality: item.proportionality,
    accessibility: item.accessibility,
  },
});

const toFindings = (item: ModelAssessment, knownIds: ReadonlySet<string>): RequirementFinding[] =>
  item.findings.map((finding) => ({
    kind: finding.kind,
    severity: finding.severity,
    requirementIds: [
      item.requirementId,
      ...finding.relatedRequirementIds.filter((id) => id !== item.requirementId && knownIds.has(id)),
    ],
    rationale: finding.rationale,
    origin: "model",
  }));

const toBatches = <T>(items: readonly T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  return batches;
};

export const assessRequirements = async (
  languageModel: ILanguageModel,
  input: AssessRequirementsInput,
): Promise<Result<RequirementAssessmentOutcome>> => {
  const assessmentsById = new Map<string, RequirementAssessment>();
  const findings: RequirementFinding[] = [];
  const knownIds = new Set(input.requirements.map((requirement) => requirement.id));

  // Sequential on purpose: the model governor already bounds provider
  // concurrency, and a review is one officer's document set, not a bulk job.
  for (const batch of toBatches(input.requirements, input.batchSize ?? DEFAULT_ASSESSMENT_BATCH_SIZE)) {
    const batchIds = new Set(batch.map((requirement) => requirement.id));
    const result = await languageModel.generateObject<RequirementAssessmentData>({
      purpose: "requirementAssessment",
      userId: input.userId,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input, batch),
      schema: requirementAssessmentSchema,
    });
    if (result.error) return result;

    const usable = result.data.object.assessments.filter(
      (item) => batchIds.has(item.requirementId) && !assessmentsById.has(item.requirementId) && hasValidScores(item),
    );
    for (const item of usable) {
      assessmentsById.set(item.requirementId, toAssessment(item));
      findings.push(...toFindings(item, knownIds));
    }
  }

  return ok({
    assessments: input.requirements.flatMap((requirement) => assessmentsById.get(requirement.id) ?? []),
    findings,
    unassessedRequirementIds: input.requirements
      .map((requirement) => requirement.id)
      .filter((id) => !assessmentsById.has(id)),
  });
};
