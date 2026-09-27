# Bug fix — object storage cannot start: the MinIO image is no longer served

- **Severity**: blocker — CI e2e, the compose smoke test, local dev and every documented container deployment fail at the image pull
- **Base branch**: `release/alpha-2`
- **Source issue**: none

## Symptom

Every stack that starts object storage fails before Wayfinder runs:

```
Unable to find image 'quay.io/minio/minio:latest' locally
docker: Error response from daemon: unauthorized: access to the requested resource is not authorized
```

In CI the three Playwright shards die at **Start MinIO (object storage)** and the
compose smoke test dies at `docker compose -f docker-compose.prod.yml up -d` on
its `storage` service. An operator following any setup guide hits the same error
on their first `docker compose up`.

## Reproduction

1. `docker pull quay.io/minio/minio:latest` — refused with `unauthorized`.
2. `docker pull minio/minio:latest` — refused; the namespace no longer exists.

## Root cause, as verified

MinIO archived its community edition, and its images are being withdrawn from
public registries one at a time. Docker Hub removed the `minio` namespace in
September 2026, which is why `ac90d28` moved every reference to quay.io. quay.io
now refuses the pull as well, so the move fixed the address but not the
dependency: any MinIO image address will keep failing, and the server itself is
archived, so a production deployment running it gets no further security fixes.

Wayfinder is barely coupled to MinIO the server. `MinioStorageAdapter` uses the
`minio` npm package, a general S3 client, and makes six plain S3 calls
(`bucketExists`, `makeBucket`, `putObject`, `getObject`, `statObject`,
`removeObject`), with no presigned URLs and no MinIO admin API. Any S3-compatible
server that returns the same error codes for a missing object (`NotFound`,
`NoSuchKey` — the adapter maps them to "does not exist") is a drop-in.

### Choosing the replacement

Measured on Docker Hub, 2026-09-27:

| Server | Pulls | Release cadence | Latest |
|---|---|---|---|
| **SeaweedFS** | 27.0M | weekly (4.42 → 4.47, 17 Aug – 14 Sep) | 4.47 |
| RustFS | 12.1M | weekly (1.0.0-rc.2 → 1.0.0) | 1.0.0, released 16 Sep |
| Garage | 6.7M | v2.4.0/v2.4.1 in Sep; v2.3.0 in April | v2.4.1 |

SeaweedFS (Apache-2.0) is the most active. Run against the adapter's own client
configuration (path-style, no region), it passed every check:

- `bucketExists` false on a fresh store, `makeBucket`, then `bucketExists` true
- `putObject` with `Content-Type`; `statObject` reports the size and type back
- `getObject` returns the bytes unchanged
- a missing object gives `NotFound` from `statObject` and `NoSuchKey` from
  `getObject` — exactly the codes the adapter maps
- `removeObject`, then `statObject` gives `NotFound`
- a wrong secret is refused with `SignatureDoesNotMatch`; an anonymous request
  gets 403

It reads credentials from `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, serves
an unauthenticated `/healthz`, and ships `curl`, so the compose healthcheck keeps
its shape. By default it reports usage telemetry to its maintainers; that is
switched off with `-master.telemetry=false`, since the setup guides describe
egress-restricted and air-gapped deployments.

## Fix plan

- Pin `chrislusf/seaweedfs:4.47@sha256:ce9e796f…` — a multi-arch index
  (amd64, arm64, arm, 386) — in `docker-compose.yml`, `docker-compose.prod.yml`
  and `.github/workflows/e2e.yml`. Command `server -dir=/data -ip=127.0.0.1
  -ip.bind=0.0.0.0 -s3 -s3.port=9000 -master.volumeSizeLimitMB=1024
  -volume.max=0 -master.telemetry=false`; credentials from the same `MINIO_ACCESS_KEY` /
  `MINIO_SECRET_KEY` variables deployers already set; healthcheck on `/healthz`.
- Store data in a new `seaweedfs-data` volume. The old `minio-data` volume is
  left untouched and no longer declared, so `docker compose down -v` cannot
  remove it.
- `restart.sh` probes `/healthz` instead of `/minio/health/live`.
- Rewrite `minio-image-source.test.ts` as the regression guard.
- Docs: a MinIO → SeaweedFS data-migration section in `upgrading.md`, and the
  storage-server instructions in `README.md` and the setup guides.

## Approved change summary

Replace the MinIO server with SeaweedFS 4.47, pinned by digest, in the three
places that start object storage. The app code and every deployer's `.env` are
unchanged. Existing deployments' stored documents do not carry across on their
own: the old data is left untouched, and `upgrading.md` gains the migration.

- **Goal** — CI, local dev and `docker compose up` start object storage again,
  from a maintained, pullable image; production stops running an archived store.
- **Business rules** — a fresh `docker compose up` from the documented files
  brings up working storage (today it fails at the pull). Storage refuses
  anonymous requests, before and after. Storage makes no outbound calls.
- **Visible behaviour** — nothing changes inside Wayfinder. Local dev loses the
  MinIO console on `:9001`. An existing deployment that upgrades without
  migrating sees documents missing until it migrates; nothing is deleted.
- **Files** — the two compose files, `e2e.yml`, `restart.sh`, the rewritten guard
  test, `upgrading.md`, `README.md` and the setup guides. No domain, application
  or adapter code changes.
- **Database** — no schema change, no generated migration. Object data needs a
  one-time operator migration.
- **Tests** — the rewritten guard fails on today's tree. No new e2e spec: the
  existing file-upload specs (policy group 3) and the compose smoke test run
  against SeaweedFS in CI.
- **Version** — PATCH, 0.28.26 → 0.28.27. Branch
  `bugfix/replace-minio-with-seaweedfs/claude-rbrasier` from `release/alpha-2`.
- **Risks** — existing deployments must migrate or documents appear missing; the
  migration's MinIO read side could not be rehearsed, since no MinIO image can be
  pulled; the pinned digest does not update itself.
- **Out of scope** — renaming the app's `MINIO_*` variables or the `Minio*`
  adapter classes (generic S3-client settings; renaming breaks every `.env`);
  automated digest updates.
