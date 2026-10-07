import type { ProportionalityTier } from "./proportionality-framework";
import type { EvidenceKind, Requirement, RequirementFinding } from "./requirement-review";

// Byte comparison, like verifyVerbatim: no trimming or case folding, because
// either is the transformation that makes a requirement paraphrased rather than
// copied from its clause.
export const locateRequirementText = (text: string, documentText: string): boolean =>
  text.length > 0 && documentText.includes(text);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "must", "shall", "will", "should",
  "are", "any", "all", "its", "their", "from", "into", "within", "each", "has", "have",
]);

// Numbers always count: "5 business days" and "10 business days" are the
// difference between a duplicate and a conflict.
const significantWords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => (word.length > 2 || /\p{N}/u.test(word)) && !STOP_WORDS.has(word)),
  );

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
};

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.8;
const EXACT_DUPLICATE_SIMILARITY = 0.95;

const numbersIn = (words: Set<string>): string[] => [...words].filter((word) => /\p{N}/u.test(word));

// Two near-identical requirements whose figures differ ("within 5 days" and
// "within 10 days") are not a duplicate to delete but a conflict to resolve.
const repeatFinding = (
  later: Requirement,
  earlier: Requirement,
  laterWords: Set<string>,
  earlierWords: Set<string>,
  similarity: number,
): RequirementFinding => {
  const laterNumbers = numbersIn(laterWords).filter((number) => !earlierWords.has(number));
  const earlierNumbers = numbersIn(earlierWords).filter((number) => !laterWords.has(number));
  if (laterNumbers.length > 0 || earlierNumbers.length > 0) {
    return {
      kind: "conflict",
      severity: "high",
      requirementIds: [later.id, earlier.id],
      rationale: `${later.id} and ${earlier.id} state the same requirement with different figures (${laterNumbers.join(", ") || "none"} against ${earlierNumbers.join(", ") || "none"}). Suppliers cannot comply with both; keep one figure.`,
      origin: "rule",
    };
  }
  return {
    kind: "duplicate",
    severity: similarity >= EXACT_DUPLICATE_SIMILARITY ? "high" : "medium",
    requirementIds: [later.id, earlier.id],
    rationale: `${later.id} repeats ${earlier.id} (${Math.round(similarity * 100)}% of significant words shared). Keep one and delete the other, or merge them.`,
    origin: "rule",
  };
};

// Filed against the later requirement: the earlier one is the one to keep.
export const findRepeatedRequirements = (
  requirements: readonly Requirement[],
  threshold = DUPLICATE_SIMILARITY_THRESHOLD,
): RequirementFinding[] => {
  const words = requirements.map((requirement) => significantWords(requirement.text));
  const findings: RequirementFinding[] = [];
  requirements.forEach((later, laterIndex) => {
    const laterWords = words[laterIndex] ?? new Set<string>();
    for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex += 1) {
      const earlier = requirements[earlierIndex];
      const earlierWords = words[earlierIndex] ?? new Set<string>();
      const similarity = jaccardSimilarity(earlierWords, laterWords);
      if (!earlier || similarity < threshold) continue;
      findings.push(repeatFinding(later, earlier, laterWords, earlierWords, similarity));
    }
  });
  return findings;
};

// All-caps words that are emphasis or so widely understood in Australian
// commercial documents that flagging them would bury the real gaps.
const COMMON_UPPERCASE_WORDS = new Set([
  "MUST", "SHALL", "SHOULD", "MAY", "NOT", "AND", "OR", "WILL", "NO", "ANY", "ALL",
  "GST", "AUD", "ABN", "ACN", "ISO", "AEST", "AEDT", "CV", "CVS", "PDF",
]);

const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9]{1,}s?\b/g;
const INLINE_EXPANSION_PATTERN = /\(([A-Z][A-Z0-9]{1,})s?\)/g;
const DEFINITION_LINE_PATTERN = /^\s*["“']?([A-Z][A-Z0-9]{1,})["”']?\s*(?:means|:|–|-)/gm;

const stripPlural = (acronym: string): string =>
  acronym.length > 2 && acronym.endsWith("s") ? acronym.slice(0, -1) : acronym;

const definedAcronyms = (documentTexts: readonly string[], definedTerms: readonly string[]): Set<string> => {
  const defined = new Set(definedTerms.map((term) => term.trim()));
  for (const text of documentTexts) {
    for (const match of text.matchAll(INLINE_EXPANSION_PATTERN)) defined.add(match[1] ?? "");
    for (const match of text.matchAll(DEFINITION_LINE_PATTERN)) defined.add(match[1] ?? "");
  }
  return defined;
};

// Only acronyms are caught here: a capitalised phrase may simply start a
// sentence, so undefined defined-terms are left to the model's clarity review.
export const findUndefinedAcronyms = (
  requirements: readonly Requirement[],
  documentTexts: readonly string[],
  definedTerms: readonly string[],
): RequirementFinding[] => {
  const defined = definedAcronyms(documentTexts, definedTerms);
  return requirements.flatMap((requirement): RequirementFinding[] => {
    const acronyms = [...new Set((requirement.text.match(ACRONYM_PATTERN) ?? []).map(stripPlural))];
    const undefinedAcronyms = acronyms.filter(
      (acronym) => !defined.has(acronym) && !COMMON_UPPERCASE_WORDS.has(acronym.toUpperCase()),
    );
    if (undefinedAcronyms.length === 0) return [];
    return [
      {
        kind: "undefined_term",
        severity: "medium",
        requirementIds: [requirement.id],
        rationale: `Not defined or expanded anywhere in the documents: ${undefinedAcronyms.join(", ")}. A supplier new to this buyer cannot be expected to know ${undefinedAcronyms.length === 1 ? "it" : "them"}.`,
        origin: "rule",
      },
    ];
  });
};

// Delivery obligations are left out: they bind only the awarded supplier, so
// they cannot exclude anyone from competing.
export const findUnlinkedMandatoryCriteria = (requirements: readonly Requirement[]): RequirementFinding[] =>
  requirements
    .filter(
      (requirement) =>
        requirement.obligation === "mandatory" && requirement.stage !== "delivery" && requirement.linkedRisk === null,
    )
    .map((requirement) => ({
      kind: "mandatory_not_risk_linked",
      severity: "medium",
      requirementIds: [requirement.id],
      rationale:
        "Mandatory, but the documents do not say what risk it manages. Either state the risk or make it desirable so a capable supplier is not excluded on a technicality.",
      origin: "rule",
    }));

const EVIDENCE_LABELS: Readonly<Record<EvidenceKind, string>> = {
  certification: "certification",
  financial_statements: "financial statements",
  insurance_certificate: "insurance certificate",
  referees: "referees",
  case_studies: "case studies",
  personnel_cvs: "personnel CVs",
  policy_documents: "policy documents",
  site_visit: "site visit",
};

const disproportionateSeverity = (requirement: Requirement): RequirementFinding["severity"] => {
  if (requirement.linkedRisk !== null) return "low";
  return requirement.obligation === "mandatory" ? "high" : "medium";
};

export const findDisproportionateEvidence = (
  requirements: readonly Requirement[],
  tier: ProportionalityTier,
): RequirementFinding[] =>
  requirements.flatMap((requirement): RequirementFinding[] => {
    const excess = requirement.evidenceRequested.filter((kind) => !tier.proportionateEvidence.includes(kind));
    if (excess.length === 0) return [];
    const excessLabels = excess.map((kind) => EVIDENCE_LABELS[kind]).join(", ");
    const justification =
      requirement.linkedRisk === null
        ? "No risk is stated that would justify it."
        : `The documents link it to "${requirement.linkedRisk}"; confirm that risk warrants this evidence.`;
    return [
      {
        kind: "unnecessary_evidence",
        severity: disproportionateSeverity(requirement),
        requirementIds: [requirement.id],
        rationale: `Asks for ${excessLabels}, which is beyond what the ${tier.label.toLowerCase()} tier treats as proportionate. ${justification}`,
        origin: "rule",
      },
    ];
  });
