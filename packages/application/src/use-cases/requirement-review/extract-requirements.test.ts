import { describe, expect, it, vi } from "vitest";
import { domainError, err, ok } from "@wayfinder/domain";
import type { ILanguageModel } from "@wayfinder/domain";
import type { RequirementExtractionData } from "@wayfinder/shared";
import { extractRequirements } from "./extract-requirements";
import { SAMPLE_SOR, SAMPLE_SOR_EXTRACTION } from "./__fixtures__/sample-sor";

const usage = { promptTokens: 1, completionTokens: 1, systemTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const makeModel = (object: RequirementExtractionData): ILanguageModel =>
  ({
    provider: "anthropic",
    generateObject: vi.fn().mockResolvedValue(ok({ object, usage, provider: "anthropic", model: "test" })),
    generateText: vi.fn(),
    streamText: vi.fn(),
    streamObject: vi.fn(),
  }) as unknown as ILanguageModel;

const extraction = (requirements: RequirementExtractionData["requirements"]): RequirementExtractionData => ({
  requirements,
  definedTerms: [],
});

describe("extractRequirements", () => {
  it("numbers requirements from the given start, traces each to its document and classifies its evidence", async () => {
    const model = makeModel({
      requirements: SAMPLE_SOR_EXTRACTION.requirements.slice(0, 2),
      definedTerms: ["Contract Manager"],
    });

    const result = await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 4 });

    expect(result.error).toBeUndefined();
    expect(result.data?.definedTerms).toEqual(["Contract Manager"]);
    expect(result.data?.requirements).toEqual([
      {
        id: "R4",
        documentId: "doc-sor",
        clauseRef: "3.1",
        text: "The Supplier must hold ISO 9001 certification.",
        sourceVerified: true,
        obligation: "mandatory",
        stage: "participation",
        linkedRisk: null,
        evidenceRequested: ["certification"],
      },
      {
        id: "R5",
        documentId: "doc-sor",
        clauseRef: "3.2",
        text: "The Supplier must provide audited financial statements for the last three financial years.",
        sourceVerified: true,
        obligation: "mandatory",
        stage: "participation",
        linkedRisk: null,
        evidenceRequested: ["financial_statements"],
      },
    ]);
  });

  it("keeps a requirement the model paraphrased but marks it as not traced to the document", async () => {
    const model = makeModel(
      extraction([{ clauseRef: "3.1", text: "Supplier needs ISO 9001.", obligation: "mandatory", stage: "participation", linkedRisk: "" }]),
    );

    const result = await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 1 });

    expect(result.data?.requirements[0]?.sourceVerified).toBe(false);
  });

  it("records the risk the document links to a requirement", async () => {
    const model = makeModel(extraction(SAMPLE_SOR_EXTRACTION.requirements.slice(8)));

    const result = await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 1 });

    expect(result.data?.requirements[0]?.linkedRisk).toBe("Disclosure of attendee personal information");
  });

  it("drops items with no text rather than reviewing an empty requirement", async () => {
    const model = makeModel(
      extraction([{ clauseRef: "9.9", text: "   ", obligation: "mandatory", stage: "participation", linkedRisk: "" }]),
    );

    const result = await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 1 });

    expect(result.data?.requirements).toEqual([]);
  });

  it("sends the document text and its kind to the model", async () => {
    const model = makeModel(extraction([]));

    await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 1, userId: "user-1" });

    const call = vi.mocked(model.generateObject).mock.calls[0]?.[0];
    expect(call?.purpose).toBe("requirementExtraction");
    expect(call?.userId).toBe("user-1");
    expect(call?.system).toContain("Statement of Requirements");
    expect(call?.prompt).toContain(SAMPLE_SOR.text);
  });

  it("returns the model's error unchanged", async () => {
    const failure = domainError("AI_PROVIDER_FAILED", "provider down");
    const model = {
      provider: "anthropic",
      generateObject: vi.fn().mockResolvedValue(err(failure)),
    } as unknown as ILanguageModel;

    const result = await extractRequirements(model, { document: SAMPLE_SOR, firstRequirementNumber: 1 });

    expect(result.error).toBe(failure);
  });
});
