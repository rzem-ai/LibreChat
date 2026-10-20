# Upgrading LibreChat

## Redis streaming now coalesces deltas by default

Redis-backed streams now batch model and tool-argument deltas in a **25 ms**
window when `STREAM_DELTA_COALESCE_MS` is unset. Explicit `0` keeps per-delta
publication; existing explicit values retain their behavior. In-memory streams
are unchanged, including deployments using `USE_REDIS_STREAMS=false`.

The same window batches durable appends and publications. It reduces Redis
round trips and repeated guard/TTL work, but not Pub/Sub message count at the cost of up to one window of buffering latency and possible loss
of unflushed deltas on process crash. Terminal and non-coalescable barriers still
flush pending batches before proceeding.

Coalescing batches Redis requests, not the subscriber wire format: each event
still publishes as an individually sequenced `chunk` frame. Subscribers from
before batch-frame support can read these publications without a preparatory
configuration change. New subscribers also retain `chunk_batch` decoding for
interoperation with existing opt-in batching producers.

This removes the new default's batch-frame compatibility hazard; it does not
promise compatibility across unrelated generation-protocol changes. If an
existing producer already emits `chunk_batch` frames through explicit opt-in,
keep those producers away from subscribers that predate batch-frame support,
or disable coalescing on those producers before introducing older subscribers.

## Tenant index migration (v0.8.7 and earlier databases)

Upgrading an existing database can log `Index build failed` for User, Role,
Preset, AccessRole, MCPServer, AgentCategory, Message, or Conversation. Older
unique indexes (for example `email_1` or `name_1`) conflict with current non-unique
indexes of the same name. Tenant-scoped compound indexes now enforce uniqueness.
This also affects single-tenant deployments. See #15759 (successor to #14826).

The tenant-index migration is an explicit maintenance command; startup does not
run it automatically. Use the updated code/image containing this command. For a
source checkout, install dependencies and build the packages first (`npm run
build:packages`).

1. Back up MongoDB and stop all LibreChat API replicas and workers that write to
   the database. Keep MongoDB available throughout the migration.
2. Preview known legacy unique indexes using the deployment's `MONGO_URI` and
   connection settings from `.env`:

   ```sh
   npm run migrate:tenant-indexes:dry-run
   ```

3. Apply the migration:

   ```sh
   npm run migrate:tenant-indexes
   ```

   With Docker Compose, stop the API and run a one-off container from the updated
   image while MongoDB remains running. Use the same Compose file flags as your
   deployment (for example, `docker compose -f deploy-compose.yml`). Set the
   working directory to `/app`, where the root npm scripts live; the production
   API image otherwise defaults to `/app/api`:

   ```sh
   docker compose stop api
   docker compose run --rm --no-deps -w /app api npm run migrate:tenant-indexes:dry-run
   docker compose run --rm --no-deps -w /app api npm run migrate:tenant-indexes
   docker compose up -d api
   ```

4. Restart writers only after the command exits successfully (status 0). Verify
   that startup no longer reports these index conflicts.

The command first builds tenant-scoped unique indexes, then drops only known
superseded unique indexes, and explicitly creates current schema indexes for the
affected collections. It preserves custom indexes and current non-unique indexes;
it does not delete documents or use `syncIndexes`/`dropIndexes`. Automatic index
creation is disabled in the maintenance process to prevent races, even when the
server normally enables it. Current indexes are explicitly built even if the
server uses `MONGO_AUTO_INDEX=false`.

The dry run only lists removals: it does not validate replacement builds, database
permissions, or duplicate data. Any listing, dropping, or building error makes
the apply command fail. If replacement creation fails (for example due to
existing duplicates or unsupported database index options), no old constraints
have been dropped. Keep writers stopped, correct the reported problem, and rerun.
A later failure can leave a partial migration; rerunning safely completes it.
Index builds may take time on large collections. Do not drop all indexes to
resolve a failure.

## Data retention migration/backfill scripts

Six offline scripts back the data-retention program, each with a `--dry-run`
mode and a corresponding `npm run migrate:<name>[:dry-run]` script:

- `migrate:drop-retention-ttl` — swaps the native Mongo TTL index on
  conversations for an app-owned one. Must run, with the purge worker already
  live, before `migrate:conversation-retention` ever stamps an `expiredAt`.
- `migrate:conversation-retention`, `migrate:file-retention`,
  `migrate:agent-retention`, `migrate:skill-retention`,
  `migrate:memory-retention` — backfill a `lastActivityAt`/`lastUsedAt` anchor
  on rows that predate each field. Idempotent; safe to rerun.

All six are non-destructive reads-then-writes, but `file-retention`,
`agent-retention`, `skill-retention`, and `memory-retention` scan unindexed
fields, so none of them should run as always-on, every-deploy automation.

### Self-hosted / Docker Compose

Same pattern as the tenant-index migration above:

```sh
docker compose stop api
docker compose run --rm --no-deps -w /app api npm run migrate:<name>:dry-run
docker compose run --rm --no-deps -w /app api npm run migrate:<name>
docker compose up -d api
```

### Kubernetes (this repo's ArgoCD-deployed `charts/`)

Each script also renders as a Kubernetes Job (`charts/templates/migration-jobs.yaml`,
driven by the `migrationJobs` map in `charts/values.yaml`), reusing the deployed
`librechat` image/Mongo secret — no separate image or `kubectl` access needed.
ArgoCD is configured to **never** auto-run these on a normal sync
(`argocd.argoproj.io/sync-options: Skip=true`); an operator triggers one
deliberately:

1. For `drop-retention-ttl`, first confirm the purge-worker-bearing `librechat`
   Deployment is already `Healthy` in ArgoCD.
2. In the ArgoCD UI, select the single `<release>-migrate-<name>` resource and
   **Sync** it. With `dryRun: true` (the default), inspect the Job's pod logs
   for the `DRY RUN RESULTS` JSON block.
3. Open a PR flipping that job's `dryRun: false` in the relevant
   `values-{env}.yaml`, merge, then repeat step 2 to do the real run. Inspect
   `MIGRATION RESULTS` and the Job's exit code.
4. Optionally flip `dryRun` back to `true` afterward so the chart's default
   state always stays "safe to accidentally sync."

`drop-retention-ttl` carries `hook-weight: "0"`; the five backfills carry
`hook-weight: "1"`, so if more than one is ever synced in the same ArgoCD
action, the TTL swap is ordered first.
