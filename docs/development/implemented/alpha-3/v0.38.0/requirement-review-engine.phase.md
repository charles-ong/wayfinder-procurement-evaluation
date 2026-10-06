# Phase — Requirement Quality Review Engine (slice 1)

- **Status**: Implemented
- **Target version**: **MINOR** — 0.37.0 → 0.38.0 (new feature, no schema change)
- **Base branch**: `main`
- **Source**: project plan agreed with the repository owner (no GitHub issue)

## 1. Goal

A procurement officer's RFQ, RFT or SOR is broken into atomic requirements,
each traced to its clause, scored 1–5 on clarity, consistency, duplication,
proportionality to value/risk and SME / new-entrant accessibility, and flagged
for conflicts, duplicates, gold-plating, unnecessary evidence requests,
undefined terms and mandatory criteria not linked to a risk. The result renders
as a Markdown procurement officer review report.

This slice is the engine only: domain and application layers, no database, no
UI, no suggested rewrites.

## 2. Approach

- **Domain** holds the vocabulary (`Requirement`, `ProcurementProfile`,
  `RequirementAssessment`, `RequirementFinding`), the value × risk
  **proportionality framework** (basic / standard / complex tiers, each with the
  evidence it treats as proportionate and a ceiling on mandatory criteria), and
  every check that needs no model:
  - repeated requirements by word overlap, split into *duplicate* (same figures)
    and *conflict* (same wording, different figures);
  - acronyms never expanded or defined in the documents;
  - mandatory participation or evaluation criteria with no stated risk
    (delivery obligations are exempt: they cannot exclude anyone from competing);
  - evidence requests above the tier, classified by rule from the text.
- **Application** holds three model-backed steps behind `ILanguageModel`:
  - `extractRequirements` — one call per document; every requirement's text is
    checked byte for byte against the source, and one that fails is kept but
    reported as untraced.
  - `assessRequirements` — batched scoring; each batch sees the whole
    requirement set so conflicts across batches are visible; model findings
    naming unknown ids are trimmed, and off-scale or missing scores leave the
    requirement "not scored" rather than inventing a score.
  - `reviewRequirements` — orchestrates extraction, rule checks and scoring,
    merges findings (a rule finding wins over the model's identical one) and
    orders them by severity.
- `renderReviewReportMarkdown` produces the review report.

## 3. Out of scope (later slices)

- Suggested rewrites with citations to the CPRs, templates and prior examples
  (slice 2, sourced from the knowledge base with verified quotes).
- Persistence (`app_` tables), the review page, DOCX report output and
  container wiring (slice 3).
