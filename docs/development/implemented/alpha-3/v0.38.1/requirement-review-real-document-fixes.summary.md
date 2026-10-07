# Implementation Summary — Requirement review fixes from a real SOR (v0.38.1)

- **Version**: 0.38.0 → **0.38.1** (PATCH — behaviour fixes, no schema change)
- **Builds on**: `../v0.38.0/requirement-review-engine.phase.md`

## Why

The first trial on a real tender document showed four problems. The document was
the Department of Finance's 37-page GovCMS Drupal and DXP Services Panel SOR,
about 100,000 characters once extracted from the PDF.

1. Every page break put the running header, the page number and the extractor's
   "-- N of M --" marker into the middle of a clause. Only 2 of 109 obligations
   could be matched to their source byte for byte.
2. The whole document went to the model in one extraction call, which is too
   large for one response.
3. "[Note to Tenderers: …]" text repeated across clauses made unrelated
   requirements look like duplicates.
4. The acronym check flagged attachment codes (D4, D6) and everyday technical
   terms (API, JSON, HTTPS).

## What changed

- `packages/domain/src/entities/procurement-text.ts` (+ test):
  - `removePageFurniture` strips repeated running headers, page numbers and
    page markers from the top of each page.
  - `splitIntoSections` cuts long text at top-level numbered headings into
    parts of at most N characters. A section that is still too long is split
    at line breaks.
- `requirement-checks.ts`:
  - `locateRequirementText` now ignores differences in whitespace only. Case
    and punctuation must still match exactly.
  - Notes to Tenderers, Respondents, Suppliers or Bidders are stripped before
    requirements are compared for duplicates and conflicts.
  - Letter-plus-digit document codes are no longer flagged as undefined terms.
  - Common ICT terms and Australian state names were added to the list of
    acronyms that need no definition.
- `extract-requirements.ts`:
  - Each part of a long document gets its own model call, 15,000 characters
    by default.
  - Requirement ids continue across parts.
  - Every requirement is checked against the whole document.
  - The prompt tells the model to leave notes to tenderers out of the
    requirement text.
- `review-requirements.ts`: page furniture is removed once, before extraction,
  so extraction, the source check and the rule checks all read the same text.

## Result on the trial document

| Measure | Before | After |
|---|---|---|
| Characters | 99,873 | 94,674 |
| Extraction calls | 1 | 8 |
| Obligations traced to their clause (of 109) | 2 | 109 |
| Rule findings | 27 | 8 |

One of the eight findings is a real one: clauses 7.2.1 c) and 7.2.3 c) are
identical.

## Tests

The domain and application unit tests now cover page-break cleanup, splitting,
whitespace-tolerant tracing, note stripping and the acronym exclusions. No e2e
tests were added because the feature still has no UI.

## Known limitations

- Running headers are recognised only within the first three non-empty lines
  of a page. Footers are not removed.
- Terms defined in a separate document, such as a Head Agreement, are still
  flagged unless that document is included in the review.
