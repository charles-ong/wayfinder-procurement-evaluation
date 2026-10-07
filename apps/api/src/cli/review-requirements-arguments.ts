import {
  PROCUREMENT_DOCUMENT_KINDS,
  RISK_TIERS,
  type ProcurementDocumentKind,
  type ProcurementProfile,
  type RiskTier,
} from "@wayfinder/domain";

export interface ReviewFileArgument {
  readonly kind: ProcurementDocumentKind;
  readonly path: string;
}

export interface ReviewArguments {
  readonly files: readonly ReviewFileArgument[];
  readonly profile: ProcurementProfile;
  readonly outPath: string | null;
  readonly jsonPath: string | null;
}

export type ParsedReviewArguments = { data: ReviewArguments; error?: undefined } | { data?: undefined; error: string };

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
};

export const mimeTypeForPath = (path: string): string | null => {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES_BY_EXTENSION[extension] ?? null;
};

const isDocumentKind = (value: string): value is ProcurementDocumentKind =>
  (PROCUREMENT_DOCUMENT_KINDS as readonly string[]).includes(value);

const isRiskTier = (value: string): value is RiskTier => (RISK_TIERS as readonly string[]).includes(value);

// --file repeats, so flags are collected as lists and the single-valued ones
// read their last occurrence.
const collectFlags = (argv: readonly string[]): Map<string, string[]> => {
  const flags = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? "";
    const value = argv[index + 1];
    if (!flag.startsWith("--") || value === undefined || value.startsWith("--")) continue;
    flags.set(flag.slice(2), [...(flags.get(flag.slice(2)) ?? []), value]);
    index += 1;
  }
  return flags;
};

const parseFile = (raw: string): ReviewFileArgument | null => {
  const separator = raw.indexOf(":");
  const kind = raw.slice(0, separator).toLowerCase();
  const path = raw.slice(separator + 1);
  if (separator === -1 || !isDocumentKind(kind) || path.length === 0) return null;
  return { kind, path };
};

export const parseReviewArguments = (argv: readonly string[]): ParsedReviewArguments => {
  const flags = collectFlags(argv);
  const last = (name: string): string | undefined => flags.get(name)?.at(-1);

  const rawFiles = flags.get("file") ?? [];
  if (rawFiles.length === 0) return { error: "Give at least one --file <rfq|rft|sor>:<path>." };
  const files = rawFiles.map(parseFile);
  const badFile = rawFiles.find((_, index) => files[index] === null);
  if (badFile !== undefined) {
    return { error: `--file "${badFile}" must be <kind>:<path>, where kind is rfq, rft or sor.` };
  }

  const estimatedValue = Number((last("value") ?? "").replace(/[$,\s]/g, ""));
  if (!last("value") || !Number.isFinite(estimatedValue) || estimatedValue < 0) {
    return { error: "--value must be the estimated value in dollars, GST inclusive, e.g. --value 60000." };
  }

  const riskTier = (last("risk") ?? "").toLowerCase();
  if (!isRiskTier(riskTier)) return { error: "--risk must be low, medium or high." };

  const category = last("category")?.trim();
  if (!category) return { error: "--category must name what is being bought, e.g. --category \"ICT support\"." };

  return {
    data: {
      files: files.filter((file): file is ReviewFileArgument => file !== null),
      profile: { estimatedValue, riskTier, category },
      outPath: last("out") ?? null,
      jsonPath: last("json") ?? null,
    },
  };
};
