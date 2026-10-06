import type { ProcurementProfile, ProcurementSourceDocument } from "@wayfinder/domain";
import type { RequirementExtractionData } from "@wayfinder/shared";

// A deliberately flawed Statement of Requirements for a low-value, low-risk buy:
// heavy evidence requests, an undefined acronym, a duplicate and a conflicting
// turnaround, so every rule check has something to find.
export const SAMPLE_SOR_TEXT = `STATEMENT OF REQUIREMENTS
Facilitation of Stakeholder Workshops

1. Definitions
"Contract Manager" means the Department officer named in the Contract.

2. Background
2.1 The Department will run six stakeholder workshops in Canberra between March and June 2027.

3. Mandatory requirements
3.1 The Supplier must hold ISO 9001 certification.
3.2 The Supplier must provide audited financial statements for the last three financial years.
3.3 The Supplier must have delivered at least ten workshops for Commonwealth entities in the last two years.
3.4 The Supplier must comply with the PSPF.

4. Service requirements
4.1 The Supplier must provide a written report to the Contract Manager within 5 business days after each workshop.
4.2 The Supplier must provide a written report to the Contract Manager within 10 business days after each workshop.
4.3 The Supplier should provide two referees for similar work.
4.4 The Supplier must provide a written report to the Contract Manager within 5 business days after each workshop, including attendance.
4.5 To manage the risk of attendee personal information being disclosed, the Supplier must store attendee lists only on Australian-hosted systems.
`;

export const SAMPLE_SOR: ProcurementSourceDocument = {
  documentId: "doc-sor",
  filename: "workshop-facilitation-sor.docx",
  kind: "sor",
  text: SAMPLE_SOR_TEXT,
};

export const SAMPLE_PROFILE: ProcurementProfile = {
  estimatedValue: 60_000,
  riskTier: "low",
  category: "Workshop facilitation services",
};

// What a well-behaved model returns for SAMPLE_SOR: every requirement copied
// verbatim, background excluded, and a risk only where the document states one.
export const SAMPLE_SOR_EXTRACTION: RequirementExtractionData = {
  requirements: [
    { clauseRef: "3.1", text: "The Supplier must hold ISO 9001 certification.", obligation: "mandatory", stage: "participation", linkedRisk: "" },
    {
      clauseRef: "3.2",
      text: "The Supplier must provide audited financial statements for the last three financial years.",
      obligation: "mandatory",
      stage: "participation",
      linkedRisk: "",
    },
    {
      clauseRef: "3.3",
      text: "The Supplier must have delivered at least ten workshops for Commonwealth entities in the last two years.",
      obligation: "mandatory",
      stage: "participation",
      linkedRisk: "",
    },
    { clauseRef: "3.4", text: "The Supplier must comply with the PSPF.", obligation: "mandatory", stage: "participation", linkedRisk: "" },
    {
      clauseRef: "4.1",
      text: "The Supplier must provide a written report to the Contract Manager within 5 business days after each workshop.",
      obligation: "mandatory",
      stage: "delivery",
      linkedRisk: "",
    },
    {
      clauseRef: "4.2",
      text: "The Supplier must provide a written report to the Contract Manager within 10 business days after each workshop.",
      obligation: "mandatory",
      stage: "delivery",
      linkedRisk: "",
    },
    { clauseRef: "4.3", text: "The Supplier should provide two referees for similar work.", obligation: "desirable", stage: "evaluation", linkedRisk: "" },
    {
      clauseRef: "4.4",
      text: "The Supplier must provide a written report to the Contract Manager within 5 business days after each workshop, including attendance.",
      obligation: "mandatory",
      stage: "delivery",
      linkedRisk: "",
    },
    {
      clauseRef: "4.5",
      text: "the Supplier must store attendee lists only on Australian-hosted systems.",
      obligation: "mandatory",
      stage: "delivery",
      linkedRisk: "Disclosure of attendee personal information",
    },
  ],
  definedTerms: ["Contract Manager"],
};
