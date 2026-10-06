import {
  classifyEvidenceRequests,
  locateRequirementText,
  ok,
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
  userId?: string | null;
}

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
  - Record a linked risk only when the document states it. Never infer one.
  - Work only from the document. Do not add requirements it does not contain.
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
  const result = await languageModel.generateObject<RequirementExtractionData>({
    purpose: "requirementExtraction",
    userId: input.userId,
    system: buildSystemPrompt(document.kind),
    prompt: `<document filename="${document.filename}">\n${document.text}\n</document>`,
    schema: requirementExtractionSchema,
  });
  if (result.error) return result;

  const items = result.data.object.requirements.filter((item) => item.text.trim().length > 0);
  return ok({
    requirements: items.map((item, index) =>
      toRequirement(document, item, `R${input.firstRequirementNumber + index}`),
    ),
    definedTerms: result.data.object.definedTerms,
  });
};
