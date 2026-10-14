# Native PostgreSQL artifact collection concurrency verification

Six isolated checks passed on PostgreSQL 17.11 on 14 October 2026. The disposable cluster stopped successfully, and no process from its extracted PostgreSQL directory remained. No hosted database, real candidate record, model API, message, or application submission was involved.

The reusable harness is `scripts/test-artifact-gc-postgres.mjs`. The execution receipt, selected migration hashes, harness hash, separate backend process IDs and observed blocking process IDs are in `docs/audits/2026-10-14-artifact-gc-native.json`.

## Proven behavior

1. Collection claims hold the owner lock. A concurrent packet publication waits on that actual PostgreSQL backend, then rejects the closed path after the claim commits.
2. A packet publication holding the owner lock causes collection to skip that owner. After publication commits, its held packet reference and storage metadata remain, and no tombstone is created.
3. The actual `job_loop_commit_phase` RPC holds the owner lock. Collection skips the transaction, and the committed artifact remains excluded when the completed run is later made old enough for collection.
4. An erasure transaction holding the owner lock causes collection to skip that owner. No collection tombstone or metadata deletion occurs before or after the erasure admission commits.
5. Two collectors run in distinct PostgreSQL backends. The second waits on the first collector's configuration lock and claims another path after the first commits; the claims do not overlap.
6. A collection tombstone survives erasure and fresh enrollment by the same account. The fresh generation cannot authorize the exact old artifact path.

The first and fifth checks observe `pg_blocking_pids()` to establish actual blocking rather than infer concurrency from JavaScript promises. Collection uses a nonblocking owner lock, so the publication-first and erasure-first cases correctly demonstrate skipping rather than waiting.

## Isolation and provenance

The Windows ZIP came directly from the vendor URL linked by PostgreSQL's Windows distribution page. Its 381,531,864 bytes matched the vendor-published SHA-256 before any executable ran:

`80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`

Every archive entry was validated for traversal, absolute paths, symlinks, destination collisions and a bounded expansion size. Only PostgreSQL binaries, libraries, shared files and documentation were extracted. The server used an unused loopback port, a newly initialized cluster, fictional account IDs and a random local password. Server data, password files, temporary files and logs stayed under the ignored fixture directory. The harness changed no service registration, PATH, firewall setting or cloud configuration.

Sources: [PostgreSQL Windows ZIP distribution](https://www.postgresql.org/download/windows/), [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries), [vendor repository checksum publication](https://github.com/EnterpriseDB/edb-installers/issues/731), [PostgreSQL licence](https://www.postgresql.org/about/licence/), [initdb documentation](https://www.postgresql.org/docs/17/app-initdb.html), [pg_ctl documentation](https://www.postgresql.org/docs/17/app-pg-ctl.html).

The checksum publication is a contributor response in the vendor's repository. No detached publisher signature was located; this receipt does not claim Authenticode verification.

## Limits

`storage.objects` is a local schema substitute. The test removes fixture metadata directly in the erasure scenario; it does not remove or verify actual Supabase Storage/S3 file bytes. The six checks do not establish HTTP upload/delete ordering, hosted cron/pg_net behavior, or deployment readiness. They use a private fixture administrator, so browser authorization and service-role privilege behavior require the separate SQL and handler boundary suites. Keep production collection disabled or limited to independently verified synthetic owners until the remaining integration checks are satisfied.

## Reproduction

Run `node scripts/test-artifact-gc-postgres.mjs` on Windows x64. It downloads the pinned official archive, verifies it, initializes a new cluster beneath this repository's `.tmp` directory, executes the checks, and stops the owned cluster in `finally`.

To reuse the verified local archive, pass `--fixture-root=<absolute existing .tmp/isolated-pg-UUID directory>`. Every run verifies the archive and extracts the required files again, then uses a new data directory and port. `--prepare-only` verifies and extracts the archive without executing its PostgreSQL binaries.

The script deliberately retains its ignored fixture directory and receipt for inspection. It does not recursively delete files. Stop the owned cluster successfully before removing that fixture directory later.
