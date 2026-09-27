# Implementation summary — object storage starts again, on SeaweedFS

- **Version**: 0.28.26 → **0.28.27** (PATCH — no schema change, no migration)
- **Base branch**: `release/alpha-2`
- **Bug-fix doc**: [`fix-object-storage-image.md`](./fix-object-storage-image.md) (this folder)
- **Source issue**: none

## Root cause

MinIO archived its community edition and its images are being withdrawn from
public registries one at a time: Docker Hub dropped `minio/minio` in September
2026, and quay.io then began refusing the pull (`unauthorized`). Every stack that
named a MinIO image failed before Wayfinder ran — the e2e shards, the compose
smoke test, local dev, and a deployer's first `docker compose up`. `ac90d28` had
already moved the address once, from Docker Hub to quay.io; moving it again would
only postpone the next failure, and the server is archived either way.

## Fix applied

- **Storage server: SeaweedFS 4.47**, pinned as
  `chrislusf/seaweedfs:4.47@sha256:ce9e796f…` (a multi-arch index) in
  `docker-compose.yml`, `docker-compose.prod.yml` and `.github/workflows/e2e.yml`.
  Chosen as the most actively maintained open-source S3-compatible server by
  Docker Hub pulls and release cadence (see the bug-fix doc).
- **Command** `server -dir=/data -ip=127.0.0.1 -ip.bind=0.0.0.0 -s3
  -s3.port=9000 -master.volumeSizeLimitMB=1024 -volume.max=0
  -master.telemetry=false`. Each flag was needed in testing: without `-ip.bind`
  S3 listens only on the container IP, so the healthcheck never passes; the
  default volume sizing (30 GB, at most 8) can leave a small disk with no room
  to create a volume; telemetry is on by default.
- **Credentials** come from the same `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` the
  app already reads, passed to SeaweedFS as `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY`. No deployer's `.env` changes.
- **Healthcheck** on `/healthz`, in both compose files, the e2e workflow and
  `restart.sh`.
- **Data** goes to a new `seaweedfs-data` volume. `minio-data` is no longer
  declared, so `docker compose down -v` cannot delete unmigrated data.
- **Docs**: a MinIO → SeaweedFS migration section in `upgrading.md` (Compose,
  ECS and Container Apps), plus troubleshooting rows; storage-server
  instructions in `README.md`, `.env.example`, `docs/features.md`, the
  e2e policy and the local, AWS, Azure and Railway setup guides.
- No domain, application or adapter code changed.

## Verification

Run against SeaweedFS started from the real compose file, through the app's own
`minio` client configuration (path-style, no region):

- all six adapter operations; bytes round-trip unchanged; `Content-Type` kept
- a missing object returns `NotFound` / `NoSuchKey`, exactly the codes
  `MinioStorageAdapter` maps to "not found"
- an 80 MiB object (multipart upload) round-trips byte-exact
- the bucket and objects survive a full container recreate
- a wrong secret is refused (`SignatureDoesNotMatch`); anonymous requests get 403
- the healthcheck goes healthy in about 14 s; the published port answers from the
  host; no telemetry is reported

The `upgrading.md` Compose procedure was extracted verbatim and run against
`docker-compose.prod.yml`, with a SeaweedFS stand-in for the temporary MinIO.
It read a non-default access key back from the running container, then
`rclone copy` and `rclone check --download` matched every object, including a
70 MiB multipart one, with 0 differences.

## Regression test added

`packages/adapters/src/storage/object-storage-image.test.ts` replaces
`minio-image-source.test.ts`, which guarded the quay.io address. Thirteen cases,
all failing on the previous tree: every file that starts storage names the
pinned SeaweedFS image, none names a MinIO server image from any registry, each
turns telemetry off, and nothing — `restart.sh` included — probes MinIO's
`/minio/health/*` paths. The MinIO pattern was checked against real lines: it
catches every registry form and ignores the app's `MINIO_*` settings and the
`minio` npm client.

## E2E

No new spec. File upload and download are e2e policy group 3, and the existing
specs for them now run against SeaweedFS on every CI run, alongside the compose
smoke test, which brings up `docker-compose.prod.yml` end to end. Neither was run
locally.

## Deviations from the approved summary

- The telemetry flag is `-master.telemetry=false`; the summary said
  `-telemetry=false`, which `weed server` rejects. Found by running it.
- Four flags not in the summary were added — `-ip`, `-ip.bind`,
  `-master.volumeSizeLimitMB`, `-volume.max` — each for the reason above.
- The migration guide reads the storage credentials from the running container
  rather than sourcing `.env`, which is Compose syntax, not shell, and can
  misbehave when sourced.
- `.env.example` and `docs/features.md` were also updated. The dev compose
  container is renamed from `wayfinder-minio` to `wayfinder-storage`; nothing
  referenced the old name.
- Ported `main`'s `033a3ad` (the welcome-tour half) after this PR's first CI
  run. `welcome-tour.spec.ts` failed in shard 3 on assertions left at the 5 s
  default straight after cold-compiled `next dev` navigations — nothing to do
  with storage; every storage-backed spec passed, as did the compose smoke test
  on SeaweedFS. `main` had already fixed the modal assertion, so
  `helpers/timeouts.ts` and the spec are copied from `main` byte for byte, which
  also keeps the next forward merge conflict-free there.

## Known limitations

- **Existing deployments must migrate** their objects, or documents appear
  missing after upgrading. Nothing is deleted; `upgrading.md` has the procedure.
- The migration's MinIO **read** side is unrehearsed: no MinIO image can be
  pulled to try it. The guide relies on the operator's locally cached image.
- Local dev loses the MinIO web console on `:9001`.
- The pinned digest does not update itself; bumping it is manual.
- The app's `MINIO_*` variables and `Minio*` adapter classes keep their names:
  they are generic S3-client settings, and renaming them would break every
  deployer's `.env`.
