import {
  classifyEvidenceRequests,
  locateRequirementText,
  ok,
  splitIntoSections,
  type ILanguageModel,
  type ProcurementDocumentKind,
  type ProcurementSourceDocument,
  type Requirement,
  type Result,
} from "@wayfinder/domain";
import { requirementExtractionSchema, type RequirementExtractionData } from "@wayfinder/shared";

export const DOCUMENT_KIND_LABELS: Readonly<Record<ProcurementDocumentKind, string>> = {
  rfq: "Request for Quotation",
  rft: "Request for Tender",
  sor: "Statement of Requirements",
};

export interface ExtractRequirementsInput {
  document: ProcurementSourceDocument;
  // Ids run on across every document in a review, so the caller says where this
  // document's numbering starts.
  firstRequirementNumber: number;
  maxSectionChars?: number;
  userId?: string | null;
}

// Roughly what one call can turn into a complete requirement list without
// running out of output: a 37-page panel SOR is about 100,000 characters.
export const DEFAULT_MAX_SECTION_CHARS = 15_000;

export interface ExtractedRequirements {
  requirements: Requirement[];
  definedTerms: string[];
}

const buildSystemPrompt = (kind: ProcurementDocumentKind): string => `<role>
  You are an experienced Australian Government procurement officer. You are reading a ${DOCUMENT_KIND_LABELS[kind]} to list every requirement it places on a supplier or on a supplier's offer, so each can be reviewed for quality.
</role>

<rules>
  - One item per obligation. Split a clause that imposes two obligations; never join two clauses into one item.
  - Copy each requirement's text byte for byte from the document. Leave out the clause number but change nothing else. If a sentence opens with a reason ("To manage the risk of …, the Supplier must …"), copy only the obligation and record the reason as its linked risk.
  - Include evaluation criteria, conditions for participation, submission requirements and service requirements. Exclude background, definitions and instructions addressed only to the buyer.
  - Leave bracketed notes such as "[Note to Tenderers: …]" out of the requirement text. They are guidance to respondents, not obligations.
  - Record a linked risk only when the document states it. Never infer one.
  - Work only from the document. Do not add requirements it does not contain.
  - You may be given one part of a longer document. List only the requirements in the part you are given.
</rules>`;

const toRequirement = (
  document: ProcurementSourceDocument,
  item: RequirementExtractionData["requirements"][number],
  id: string,
): Requirement => {
  const linkedRisk = item.linkedRisk.trim();
  return {
    id,
    documentId: document.documentId,
    clauseRef: item.clauseRef.trim(),
    text: item.text,
    sourceVerified: locateRequirementText(item.text, document.text),
    obligation: item.obligation,
    stage: item.stage,
    linkedRisk: linkedRisk.length > 0 ? linkedRisk : null,
    evidenceRequested: classifyEvidenceRequests(item.text),
  };
};

export const extractRequirements = async (
  languageModel: ILanguageModel,
  input: ExtractRequirementsInput,
): Promise<Result<ExtractedRequirements>> => {
  const { document } = input;
  const parts = splitIntoSections(document.text, input.maxSectionChars ?? DEFAULT_MAX_SECTION_CHARS);
  const requirements: Requirement[] = [];
  const definedTerms = new Set<string>();

  for (const [index, part] of parts.entries()) {
    const result = await languageModel.generateObject<RequirementExtractionData>({
      purpose: "requirementExtraction",
      userId: input.userId,
      system: buildSystemPrompt(document.kind),
      prompt: `<document filename="${document.filename}" part="${index + 1} of ${parts.length}">\n${part}\n</document>`,
      schema: requirementExtractionSchema,
    });
    if (result.error) return result;

    // Verified against the whole document, not the part: a clause cut at a
    // part boundary still traces to its source.
    const items = result.data.object.requirements.filter((item) => item.text.trim().length > 0);
    for (const item of items) {
      requirements.push(toRequirement(document, item, `R${input.firstRequirementNumber + requirements.length}`));
    }
    for (const term of result.data.object.definedTerms) definedTerms.add(term);
  }

  return ok({ requirements, definedTerms: [...definedTerms] });
};
