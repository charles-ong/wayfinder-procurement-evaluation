import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROPORTIONALITY_FRAMEWORK,
  classifyEvidenceRequests,
  resolveProportionalityTier,
} from "./proportionality-framework";

const profile = (estimatedValue: number, riskTier: "low" | "medium" | "high") => ({
  estimatedValue,
  riskTier,
  category: "Professional services",
});

describe("resolveProportionalityTier", () => {
  it("puts a low-risk buy under the basic value ceiling in the basic tier", () => {
    const tier = resolveProportionalityTier(profile(50_000, "low"), DEFAULT_PROPORTIONALITY_FRAMEWORK);

    expect(tier.name).toBe("basic");
  });

  it("puts a medium-risk buy under the basic value ceiling in the standard tier", () => {
    const tier = resolveProportionalityTier(profile(50_000, "medium"), DEFAULT_PROPORTIONALITY_FRAMEWORK);

    expect(tier.name).toBe("standard");
  });

  it("treats the basic value ceiling itself as above the basic tier", () => {
    const tier = resolveProportionalityTier(profile(80_000, "low"), DEFAULT_PROPORTIONALITY_FRAMEWORK);

    expect(tier.name).toBe("standard");
  });

  it("puts any high-risk buy in the complex tier whatever its value", () => {
    const tier = resolveProportionalityTier(profile(10_000, "high"), DEFAULT_PROPORTIONALITY_FRAMEWORK);

    expect(tier.name).toBe("complex");
  });

  it("puts a buy at or above the complex value floor in the complex tier whatever its risk", () => {
    const tier = resolveProportionalityTier(profile(1_000_000, "low"), DEFAULT_PROPORTIONALITY_FRAMEWORK);

    expect(tier.name).toBe("complex");
  });
});

describe("classifyEvidenceRequests", () => {
  it("recognises certification, financial statements and insurance evidence", () => {
    const text =
      "The Supplier must hold ISO 9001 certification, provide audited financial statements for the last three years and a certificate of currency for public liability insurance.";

    expect(classifyEvidenceRequests(text)).toEqual([
      "certification",
      "financial_statements",
      "insurance_certificate",
    ]);
  });

  it("recognises referees, case studies, CVs, policies and site visits", () => {
    expect(classifyEvidenceRequests("Provide two referees.")).toEqual(["referees"]);
    expect(classifyEvidenceRequests("Include three case studies of similar work.")).toEqual(["case_studies"]);
    expect(classifyEvidenceRequests("Attach CVs for all key personnel.")).toEqual(["personnel_cvs"]);
    expect(classifyEvidenceRequests("Submit a copy of your modern slavery policy.")).toEqual(["policy_documents"]);
    expect(classifyEvidenceRequests("Tenderers must attend a site visit.")).toEqual(["site_visit"]);
  });

  it("returns nothing for a requirement that asks for no evidence", () => {
    expect(classifyEvidenceRequests("The service must be available from 8am to 6pm AEST.")).toEqual([]);
  });

  it("does not read a certificate of currency as a certification", () => {
    expect(classifyEvidenceRequests("Provide a certificate of currency.")).toEqual(["insurance_certificate"]);
  });
});
