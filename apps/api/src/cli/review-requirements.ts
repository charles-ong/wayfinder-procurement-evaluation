/**
 * Runs the requirement quality review on local RFQ, RFT or SOR files and writes
 * the procurement officer review report. A trial harness for tuning the review
 * against real documents before it has a page of its own.
 *
 * Usage:
 *   pnpm --filter @wayfinder/api review-requirements -- \
 *     --file sor:./workshop-sor.docx [--file rft:./tender.pdf] \
 *     --value 60000 --risk low --category "Workshop facilitation" \
 *     [--out report.md] [--json review.json]
 *
 * The model comes from the deployment's AI settings when DATABASE_URL is set,
 * otherwise from AI_DEFAULT_PROVIDER and the matching provider key in the
 * environment (e.g. ANTHROPIC_API_KEY).
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { renderReviewReportMarkdown, reviewRequirements } from "@wayfinder/application";
import {
  DocumentExtractorService,
  DocxGenerator,
  DrizzleSystemSettingsRepository,
  EncryptedSystemSettingsRepository,
  LanguageModelAdapter,
  RuntimeConfigStore,
  SettingsEncryptionService,
  createDatabase,
  createSettingsEncryptionKey,
} from "@wayfinder/adapters";
import {
  ok,
  type ISystemSettingsRepository,
  type ProcurementSourceDocument,
  type ProviderName,
  type Result,
} from "@wayfinder/domain";
import { EMBEDDINGS_DEFAULT_PROVIDER } from "@wayfinder/shared";
import { loadEnv } from "../env.js";
import { mimeTypeForPath, parseReviewArguments, type ReviewFileArgument } from "./review-requirements-arguments.js";

const usage = [
  "Usage: pnpm --filter @wayfinder/api review-requirements -- --file <rfq|rft|sor>:<path> [--file …]",
  "         --value <dollars> --risk <low|medium|high> --category <text> [--out report.md] [--json review.json]",
  "",
  "Reads .docx, .pdf, .txt and .md files. Without --out the report is printed.",
].join("\n");

// No stored settings, so every lookup falls back to the environment defaults.
const environmentOnlySettings: ISystemSettingsRepository = {
  get: async () => ok(null),
  set: async () => {
    throw new Error("The review command does not write settings.");
  },
  delete: async () => ok(undefined),
};

const PROVIDERS: readonly ProviderName[] = ["anthropic", "openai", "mistral", "bedrock"];

const providerFromEnvironment = (): ProviderName => {
  const configured = process.env.AI_DEFAULT_PROVIDER ?? "anthropic";
  return PROVIDERS.find((provider) => provider === configured) ?? "anthropic";
};

const bedrockCredentials = () => {
  const { AWS_BEDROCK_REGION, AWS_BEDROCK_ACCESS_KEY_ID, AWS_BEDROCK_SECRET_ACCESS_KEY } = process.env;
  if (!AWS_BEDROCK_REGION || !AWS_BEDROCK_ACCESS_KEY_ID || !AWS_BEDROCK_SECRET_ACCESS_KEY) return null;
  return { region: AWS_BEDROCK_REGION, accessKeyId: AWS_BEDROCK_ACCESS_KEY_ID, secretAccessKey: AWS_BEDROCK_SECRET_ACCESS_KEY };
};

const buildRuntimeConfig = (settings: ISystemSettingsRepository, provider: ProviderName): RuntimeConfigStore =>
  new RuntimeConfigStore(settings, {
    provider,
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY ?? null,
      openai: process.env.OPENAI_API_KEY ?? null,
      mistral: process.env.MISTRAL_API_KEY ?? null,
      bedrock: bedrockCredentials(),
    },
    // Object storage is never touched by this command; the store only needs a shape.
    storage: {
      endpoint: "localhost",
      port: 9000,
      useSSL: false,
      accessKey: "",
      secretKey: "",
      bucket: "",
      region: "",
      pathStyle: true,
    },
    embeddingsProvider: EMBEDDINGS_DEFAULT_PROVIDER,
  });

const readDocument = async (
  extractor: DocumentExtractorService,
  file: ReviewFileArgument,
): Promise<Result<ProcurementSourceDocument>> => {
  const mimeType = mimeTypeForPath(file.path);
  if (!mimeType) {
    return { error: { code: "VALIDATION_FAILED", message: `${file.path}: only .docx, .pdf, .txt and .md files can be read.` } };
  }
  const text = await extractor.extract({ buffer: await readFile(file.path), mimeType });
  if (text.error) return text;
  return ok({ documentId: file.path, filename: basename(file.path), kind: file.kind, text: text.data });
};

const run = async (settings: ISystemSettingsRepository, provider: ProviderName, argv: readonly string[]): Promise<number> => {
  const parsed = parseReviewArguments(argv);
  if (parsed.error !== undefined) {
    console.error(`${parsed.error}\n\n${usage}`);
    return 2;
  }

  const extractor = new DocumentExtractorService(new DocxGenerator());
  const documents: ProcurementSourceDocument[] = [];
  for (const file of parsed.data.files) {
    const document = await readDocument(extractor, file);
    if (document.error) {
      console.error(`Could not read ${file.path}: ${document.error.message}`);
      return 1;
    }
    documents.push(document.data);
  }

  console.error(`Reviewing ${documents.length} document(s) with ${provider}…`);
  const languageModel = new LanguageModelAdapter(provider, buildRuntimeConfig(settings, provider));
  const review = await reviewRequirements(languageModel, { documents, profile: parsed.data.profile });
  if (review.error) {
    console.error(`Review failed (${review.error.code}): ${review.error.message}`);
    return 1;
  }

  const report = renderReviewReportMarkdown(review.data);
  if (parsed.data.jsonPath) await writeFile(parsed.data.jsonPath, JSON.stringify(review.data, null, 2));
  if (!parsed.data.outPath) {
    process.stdout.write(report);
    return 0;
  }
  await writeFile(parsed.data.outPath, report);
  console.error(`Report written to ${parsed.data.outPath}.`);
  return 0;
};

const PROVIDER_KEY_VARIABLES: Readonly<Record<ProviderName, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  bedrock: "AWS_BEDROCK_ACCESS_KEY_ID",
};

const runFromEnvironment = (argv: readonly string[]): Promise<number> => {
  const provider = providerFromEnvironment();
  const keyVariable = PROVIDER_KEY_VARIABLES[provider];
  if (!process.env[keyVariable]) {
    console.error(`No model credentials: set ${keyVariable}, or DATABASE_URL to use the deployment's AI settings.`);
    return Promise.resolve(2);
  }
  return run(environmentOnlySettings, provider, argv);
};

const main = async (): Promise<number> => {
  const argv = process.argv.slice(2);
  if (!process.env.DATABASE_URL) return runFromEnvironment(argv);

  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL, 1);
  try {
    const settings = new EncryptedSystemSettingsRepository(
      new DrizzleSystemSettingsRepository(database),
      new SettingsEncryptionService(createSettingsEncryptionKey(env.SETTINGS_ENCRYPTION_KEY)),
    );
    return await run(settings, env.AI_DEFAULT_PROVIDER, argv);
  } finally {
    await database.$client.end();
  }
};

main()
  .then((code) => process.exit(code))
  .catch((cause) => {
    console.error(cause);
    process.exit(1);
  });
