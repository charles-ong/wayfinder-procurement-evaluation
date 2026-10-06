import {
  FINDING_KIND_LABELS,
  QUALITY_DIMENSIONS,
  QUALITY_DIMENSION_LABELS,
  type FindingSeverity,
  type Requirement,
  type RequirementAssessment,
  type RequirementFinding,
} from "@wayfinder/domain";
import { DOCUMENT_KIND_LABELS } from "./extract-requirements";
import { formatAud } from "./review-format";
import type { RequirementReview } from "./review-requirements";

const SEVERITIES_MOST_SEVERE_FIRST: readonly FindingSeverity[] = ["high", "medium", "low"];

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const escapeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const clauseLabel = (requirement: Requirement | undefined, id: string): string =>
  requirement?.clauseRef ? `${id} (clause ${requirement.clauseRef})` : id;

const renderSummary = (review: RequirementReview): string => {
  const severityCounts = SEVERITIES_MOST_SEVERE_FIRST.map(
    (severity) => `${review.findings.filter((finding) => finding.severity === severity).length} ${severity}`,
  );
  const documents = review.documents
    .map((document) => `${document.filename} (${DOCUMENT_KIND_LABELS[document.kind]}, ${plural(document.requirementCount, "requirement")})`)
    .join("; ");
  const rows = [
    ["Category", review.profile.category],
    ["Estimated value", `${formatAud(review.profile.estimatedValue)} (GST inclusive)`],
    ["Risk", capitalise(review.profile.riskTier)],
    ["Proportionality tier", `${review.tier.label}. ${review.tier.description}`],
    ["Documents reviewed", documents],
    ["Requirements", `${review.requirements.length} (${review.mandatoryCriteriaCount} mandatory ${review.mandatoryCriteriaCount === 1 ? "criterion" : "criteria"} before award)`],
    ["Findings", severityCounts.join(", ")],
  ];
  const table = ["| | |", "|---|---|", ...rows.map(([label, value]) => `| ${label} | ${escapeCell(value ?? "")} |`)];
  const lines = ["## Summary", "", ...table];
  if (review.mandatoryCriteriaCount > review.tier.maxMandatoryCriteria) {
    lines.push(
      "",
      `> ${review.mandatoryCriteriaCount} mandatory criteria is more than the ${review.tier.maxMandatoryCriteria} the ${review.tier.label} tier treats as proportionate. Each extra pass/fail condition is another way to exclude a capable SME; consider which can become desirable.`,
    );
  }
  return lines.join("\n");
};

const averageScore = (assessments: readonly RequirementAssessment[], dimension: (typeof QUALITY_DIMENSIONS)[number]): string => {
  if (assessments.length === 0) return "–";
  const total = assessments.reduce((sum, assessment) => sum + assessment.scores[dimension].score, 0);
  return (total / assessments.length).toFixed(1);
};

const renderAverages = (review: RequirementReview): string =>
  [
    "## Scores by dimension",
    "",
    "Average across scored requirements, from 1 (serious problem) to 5 (no concern).",
    "",
    "| Dimension | Average |",
    "|---|---|",
    ...QUALITY_DIMENSIONS.map(
      (dimension) => `| ${QUALITY_DIMENSION_LABELS[dimension]} | ${averageScore(review.assessments, dimension)} |`,
    ),
  ].join("\n");

const renderFinding = (finding: RequirementFinding, requirementsById: ReadonlyMap<string, Requirement>): string => {
  const [primaryId = "", ...relatedIds] = finding.requirementIds;
  const related = relatedIds.length > 0 ? ` with ${relatedIds.map((id) => clauseLabel(requirementsById.get(id), id)).join(", ")}` : "";
  const origin = finding.origin === "rule" ? "Rule check." : "AI judgement.";
  return `- **${FINDING_KIND_LABELS[finding.kind]}**: ${clauseLabel(requirementsById.get(primaryId), primaryId)}${related}. ${origin}\n  ${finding.rationale}`;
};

const renderFindings = (review: RequirementReview, requirementsById: ReadonlyMap<string, Requirement>): string => {
  if (review.findings.length === 0) return "## Findings\n\nNo findings.";
  const sections = SEVERITIES_MOST_SEVERE_FIRST.flatMap((severity) => {
    const findings = review.findings.filter((finding) => finding.severity === severity);
    if (findings.length === 0) return [];
    return [`### ${capitalise(severity)}`, "", ...findings.map((finding) => renderFinding(finding, requirementsById)), ""];
  });
  return ["## Findings", "", ...sections].join("\n").trimEnd();
};

const renderRequirementTable = (review: RequirementReview): string => {
  const assessmentsById = new Map(review.assessments.map((assessment) => [assessment.requirementId, assessment]));
  const header = `| ID | Clause | Obligation | Stage | ${QUALITY_DIMENSIONS.map((dimension) => capitalise(dimension)).join(" | ")} | Findings |`;
  const divider = `|${"---|".repeat(QUALITY_DIMENSIONS.length + 5)}`;
  const rows = review.requirements.map((requirement) => {
    const assessment = assessmentsById.get(requirement.id);
    const scores = QUALITY_DIMENSIONS.map((dimension) => (assessment ? String(assessment.scores[dimension].score) : "–"));
    const findingCount = review.findings.filter((finding) => finding.requirementIds.includes(requirement.id)).length;
    return `| ${requirement.id} | ${escapeCell(requirement.clauseRef)} | ${capitalise(requirement.obligation)} | ${capitalise(requirement.stage)} | ${scores.join(" | ")} | ${findingCount} |`;
  });
  return ["## Requirements", "", header, divider, ...rows].join("\n");
};

const renderRationale = (review: RequirementReview): string => {
  const assessmentsById = new Map(review.assessments.map((assessment) => [assessment.requirementId, assessment]));
  const blocks = review.requirements.map((requirement) => {
    const assessment = assessmentsById.get(requirement.id);
    const heading = `### ${clauseLabel(requirement, requirement.id)}, ${requirement.obligation}, ${requirement.stage}`;
    const risk = requirement.linkedRisk ? [`Linked risk: ${requirement.linkedRisk}`, ""] : [];
    const scores = assessment
      ? QUALITY_DIMENSIONS.map(
          (dimension) =>
            `- ${QUALITY_DIMENSION_LABELS[dimension]}: ${assessment.scores[dimension].score}/5. ${assessment.scores[dimension].rationale}`,
        )
      : ["- Not scored."];
    return [heading, "", `> ${requirement.text}`, "", ...risk, ...scores].join("\n");
  });
  return ["## Score rationale", "", blocks.join("\n\n")].join("\n");
};

const renderAttention = (review: RequirementReview): string | null => {
  const untraced = review.requirements
    .filter((requirement) => !requirement.sourceVerified)
    .map((requirement) => `- ${requirement.id} could not be matched word for word to its clause. Check it against the source before relying on its findings.`);
  const unscored = review.unassessedRequirementIds.map(
    (id) => `- ${id} was not scored. The AI returned no usable assessment for it; review it by hand.`,
  );
  const unreadable = review.documents
    .filter((document) => !document.readable)
    .map((document) => `- ${document.filename} has no readable text. It may be a scanned image; supply a text version to include it.`);
  const items = [...unreadable, ...untraced, ...unscored];
  if (items.length === 0) return null;
  return ["## Needs your attention", "", ...items].join("\n");
};

export const renderReviewReportMarkdown = (review: RequirementReview): string => {
  const requirementsById = new Map(review.requirements.map((requirement) => [requirement.id, requirement]));
  const sections = [
    "# Requirement quality review",
    renderSummary(review),
    renderAttention(review),
    renderFindings(review, requirementsById),
    renderAverages(review),
    renderRequirementTable(review),
    renderRationale(review),
  ];
  return `${sections.filter((section): section is string => section !== null).join("\n\n")}\n`;
};
