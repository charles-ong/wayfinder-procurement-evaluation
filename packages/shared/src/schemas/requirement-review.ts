import { z } from "zod";

// The value lists below restate the domain's (requirement-review.ts in
// @wayfinder/domain): this package cannot import the domain, so a test in
// @wayfinder/application keeps the two in step.
const obligationSchema = z.enum(["mandatory", "desirable", "informational"]);

export const requirementExtractionSchema = z.object({
  requirements: z
    .array(
      z.object({
        clauseRef: z
          .string()
          .describe("The clause or paragraph number the requirement sits under, e.g. \"4.2.1\". Empty string if unnumbered."),
        text: z
          .string()
          .describe(
            "The requirement copied byte for byte from the document: same spelling, case, spacing and punctuation. One obligation per item; never paraphrase or join two clauses.",
          ),
        obligation: obligationSchema.describe(
          "mandatory: a pass/fail condition (must, shall, is required, will be excluded). desirable: scored or preferred (should, desirable, preference). informational: describes context and imposes no obligation.",
        ),
        stage: z
          .enum(["participation", "evaluation", "delivery"])
          .describe(
            "participation: a condition a supplier must meet to be considered at all. evaluation: a criterion offers are scored or compared on. delivery: an obligation that applies only once the contract is awarded.",
          ),
        linkedRisk: z
          .string()
          .describe(
            "The risk the document itself says this requirement manages, in a few words. Empty string when the document states no reason or risk for it; never infer one.",
          ),
      }),
    )
    .describe("Every requirement placed on the supplier or their offer, in document order."),
  definedTerms: z
    .array(z.string())
    .describe("Every term and acronym the document formally defines (a definitions section, glossary or inline expansion), exactly as written."),
});

const dimensionScoreSchema = z.object({
  score: z.number().int().min(1).max(5).describe("1 = serious problem, 5 = no concern."),
  rationale: z.string().describe("One or two sentences naming what in the requirement drives the score."),
});

export const requirementAssessmentSchema = z.object({
  assessments: z.array(
    z.object({
      requirementId: z.string().describe("The id of the requirement being assessed, exactly as given (e.g. \"R3\")."),
      clarity: dimensionScoreSchema,
      consistency: dimensionScoreSchema,
      duplication: dimensionScoreSchema,
      proportionality: dimensionScoreSchema,
      accessibility: dimensionScoreSchema,
      findings: z
        .array(
          z.object({
            kind: z.enum([
              "conflict",
              "duplicate",
              "gold_plating",
              "unnecessary_evidence",
              "undefined_term",
              "mandatory_not_risk_linked",
            ]),
            severity: z.enum(["low", "medium", "high"]),
            relatedRequirementIds: z
              .array(z.string())
              .describe("Ids of the other requirements this one conflicts with or duplicates. Empty for findings about this requirement alone."),
            rationale: z.string().describe("What the problem is and why it matters to a supplier, in plain language."),
          }),
        )
        .describe("Problems with this requirement. Empty when there are none; never invent one to fill the list."),
    }),
  ),
});

export type RequirementExtractionData = z.infer<typeof requirementExtractionSchema>;
export type RequirementAssessmentData = z.infer<typeof requirementAssessmentSchema>;
