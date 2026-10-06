# Implementation Summary — Requirement Quality Review Engine (v0.38.0)

- **Version**: 0.37.0 → **0.38.0** (MINOR — new feature, no schema change)
- **Phase doc**: `requirement-review-engine.phase.md` (this folder)

## What was built

The engine of the Buyer Requirement Quality Review Assistant. Given RFQ, RFT
or SOR text and a procurement profile (estimated value, risk tier, category),
`reviewRequirements` extracts each requirement verbatim, runs the rule checks,
has the model score the five quality dimensions and add judgement findings,
and returns a `RequirementReview` that `renderReviewReportMarkdown` turns into
a procurement officer review report.

## Files created

**`packages/domain/src/entities`**
- `requirement-review.ts` (+ test) — types, dimension and finding vocabularies,
  `mergeFindings`.
- `proportionality-framework.ts` (+ test) — tiers, `resolveProportionalityTier`,
  `classifyEvidenceRequests`.
- `requirement-checks.ts` (+ test) — `locateRequirementText`,
  `findRepeatedRequirements`, `findUndefinedAcronyms`,
  `findUnlinkedMandatoryCriteria`, `findDisproportionateEvidence`.

**`packages/shared/src/schemas`**
- `requirement-review.ts` — `requirementExtractionSchema`,
  `requirementAssessmentSchema`.

**`packages/application/src/use-cases/requirement-review`**
- `extract-requirements.ts` (+ test), `assess-requirements.ts` (+ test),
  `review-requirements.ts` (+ test), `render-review-report.ts` (+ test),
  `review-format.ts`, `requirement-review-schema.test.ts` (keeps the shared
  schema's value lists in step with the domain), `__fixtures__/sample-sor.ts`.

## Files modified

- `packages/domain/src/entities/index.ts`, `packages/shared/src/schemas/index.ts`,
  `packages/application/src/use-cases/index.ts` — exports.
- `VERSION`, `package.json` — 0.38.0.

## Migrations

None.

## Tests

Unit tests at the domain and application layers with a scripted
`ILanguageModel`. No e2e — no UI or route exists yet; behaviour is covered at
the domain and application layers.

## Known limitations

- Not wired into either app; there is no route, page or container entry yet.
- One extraction call per document: very long documents may exceed the model's
  output budget.
- The default framework values (basic ceiling $80,000, complex floor
  $1,000,000, evidence lists, mandatory ceilings) are a starting position to
  be tuned and confirmed against the current CPRs.
- Undefined-term detection by rule covers acronyms only; undefined capitalised
  terms are left to the model's clarity score.
