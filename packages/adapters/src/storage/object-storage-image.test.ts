import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MinIO archived its community edition and its images are being withdrawn one
// registry at a time: Docker Hub dropped `minio/minio` in September 2026, and
// quay.io then refused the pull too. Every stack that named it failed at the
// pull — CI, local dev, and a deployer's first `docker compose up` alike. Object
// storage is SeaweedFS now, pinned by digest so a registry can neither withdraw
// nor silently change what these files start. This guards the address rather
// than the pull: a reverted image, or a service block copied from an old file,
// fails here instead of in a deployer's terminal.
//
// The tag is informational; the digest is what Docker resolves. It is a
// multi-arch index (amd64, arm64, arm, 386), so the pin holds on Apple Silicon.
const PINNED_IMAGE =
  "chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882";

// Any registry's MinIO server image: `minio/minio`, `quay.io/minio/minio`, with
// or without a tag. The npm client and the app's MINIO_* settings are generic S3
// configuration and are deliberately not matched.
const MINIO_SERVER_IMAGE = /(^|[\s"'=:])([\w.-]+\/)?minio\/minio\b/;

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const FILES_THAT_START_STORAGE = [
  "docker-compose.yml",
  "docker-compose.prod.yml",
  ".github/workflows/e2e.yml",
] as const;

// Everything that waits on storage being up. SeaweedFS answers /healthz; MinIO's
// /minio/health/* paths return 403 from it, so a stale probe never goes green.
const FILES_THAT_PROBE_STORAGE = [...FILES_THAT_START_STORAGE, "restart.sh"] as const;

const read = (relativePath: string): string =>
  readFileSync(join(repositoryRoot, relativePath), "utf8");

const offendingLines = (relativePath: string, pattern: RegExp): string[] =>
  read(relativePath)
    .split("\n")
    .map((text, index) => ({ number: index + 1, text }))
    .filter(({ text }) => pattern.test(text))
    .map(({ number, text }) => `${relativePath}:${number}: ${text.trim()}`);

describe("object storage image", () => {
  it.each(FILES_THAT_START_STORAGE)("%s starts the pinned SeaweedFS image", (file) => {
    expect(read(file)).toContain(PINNED_IMAGE);
  });

  it.each(FILES_THAT_START_STORAGE)("%s names no MinIO server image", (file) => {
    expect(
      offendingLines(file, MINIO_SERVER_IMAGE),
      "MinIO's images are no longer served — start storage from the pinned SeaweedFS image",
    ).toEqual([]);
  });

  // The setup guides describe egress-restricted and air-gapped deployments, and
  // SeaweedFS reports usage to its maintainers unless told not to.
  it.each(FILES_THAT_START_STORAGE)("%s starts SeaweedFS with telemetry off", (file) => {
    const contents = read(file);
    expect(contents).toContain("-master.telemetry=false");
    expect(contents).not.toContain("-master.telemetry=true");
  });

  it.each(FILES_THAT_PROBE_STORAGE)("%s does not probe MinIO's health endpoints", (file) => {
    expect(offendingLines(file, /\/minio\/health\//)).toEqual([]);
  });
});
