---
name: safe-docker-pr-testing
description: Safely build and test a pull request as a fully isolated Docker Compose stack without switching the current checkout or changing existing containers, images, networks, ports, volumes, or data.
compatibility: Requires Git, Docker, Docker Compose v2.24.4 or newer, and access to the pull request repository. A CLI or MCP integration for your Git hosting provider is recommended.
metadata:
  audience: developers
  workflow: pull-request-testing
  isolation: full
---

# Safe Docker PR Testing

Test a pull request in a detached Git worktree and a completely separate Docker Compose project.
The PR stack must use unique application image tags, container names, host ports, network names,
and persistent storage. It must be possible to run the normal stack and PR stack concurrently.

This skill supports **full-isolation mode only**. Do not temporarily swap a PR image into an
existing stack and do not reuse an existing database or named volume.

This workflow is repository-agnostic. Discover services, files, ports, build targets, migration
behavior, health checks, and persistence from the repository instead of assuming them.

## Isolation Contract

The PR test must not:

- switch, stash, reset, clean, or modify the user's current checkout;
- stop, recreate, rename, or remove existing containers;
- reuse the normal application's image tag;
- reuse an existing Compose project name, fixed container name, network, or data volume;
- reuse bind-mounted database, uploads, cache, or other mutable application data;
- publish a host port already used by another process or container;
- run migrations against an existing database;
- run broad cleanup such as `docker system prune` or unscoped volume/image removal;
- copy secrets into the worktree or commit test-only configuration.

The PR stack may reuse read-only configuration and credentials from the main checkout when needed,
but it must use separate mutable data and runtime resources.

## Required Inputs

Obtain or discover:

- pull request URL or number;
- repository root and remote containing the PR;
- exact base SHA and head SHA;
- all changed application services and their Dockerfiles/build targets;
- Compose files used by the normal local stack;
- current Compose project name and running containers;
- host ports required for browser/API access;
- database, object storage, uploads, cache, and other persistence mechanisms;
- automatic migration behavior;
- deterministic readiness/health checks;
- PR-specific automated and manual acceptance criteria.

Ask one concise question if the affected services, runtime entry point, migration behavior, or safe
health check is ambiguous. Do not guess when a mistake could connect the PR to existing data.

## Phase 1: Inspect The PR And Existing Environment

Read the PR before running builds:

- description and testing instructions;
- changed files and commits;
- CI/check results;
- review comments and unresolved findings;
- base branch and exact head SHA;
- schema, migration, queue, storage, and environment changes;
- services that must be rebuilt together.

Use the hosting provider's MCP integration when available. Otherwise use its CLI to view the PR, its diff, and its checks.

Inspect the checkout without modifying it:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v # redact any embedded credentials/tokens before sharing output
git worktree list
```

Inspect Docker and Compose without modifying them:

```bash
cd "$REPO_ROOT"
docker compose version
docker compose config --services
docker compose config --images
docker compose ps
docker ps -a
docker image ls
docker volume ls
docker network ls
```

Use `docker-compose` instead of `docker compose` if that is the installed interface, but verify it
supports Compose `!override` and `!reset` tags. Require Docker Compose v2.24.4 or newer when those
tags are needed.

Record the normal environment before creating anything:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker volume ls
docker network ls
```

Do not expose secret values. Print only variable names or redact tokens, passwords, keys, and
connection strings.

## Phase 2: Choose A Safe Worktree Location

Use a durable sibling directory by default. It survives long builds and is easy to find:

```bash
PR_NUMBER=<number>
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_PARENT="$(dirname "$REPO_ROOT")"
REPO_NAME="$(basename "$REPO_ROOT")"
WORKTREE="$REPO_PARENT/${REPO_NAME}-pr${PR_NUMBER}"
ARTIFACT_ROOT="$REPO_PARENT/${REPO_NAME}-pr${PR_NUMBER}-artifacts"
PORT_REGISTRY="$REPO_ROOT/.git/safe-docker-pr-testing-ports.yaml"
```

`PORT_REGISTRY` is a single file per repository clone, not per PR. It lives under `.git/` so it is
never committed, never shows up in `git status`, and survives the per-PR `ARTIFACT_ROOT` teardown in
Phase 11 — this is what makes port assignments reusable across separate test sessions for the same
PR. See Host Ports below for its schema and how it is read/written.

If the repository is inside OneDrive, SharePoint, or another synced `CloudStorage` path, put the
worktree and artifacts in the operating system's temporary directory to avoid syncing thousands of
checked-out files:

```bash
case "$REPO_ROOT" in
  *OneDrive*|*SharePoint*|*CloudStorage*)
    TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/${REPO_NAME}-pr${PR_NUMBER}.XXXXXX")"
    WORKTREE="$TEST_ROOT/worktree"
    ARTIFACT_ROOT="$TEST_ROOT/artifacts"
    ;;
esac
```

Important: a worktree outside OneDrive still reads Git objects from the main repository's `.git`
directory. If checkout stalls on a synced repository, do not retry indefinitely. Hydrate the Git
object store or use an independent single-branch clone outside OneDrive as a fallback.

Do not overwrite an existing worktree/artifact directory. If either path exists, inspect it and ask
whether it belongs to an active or previous PR test.

## Phase 3: Fetch The Exact PR Head

Use a named remote-tracking ref rather than mutable `FETCH_HEAD`:

```bash
PR_REF="refs/remotes/origin/pr-${PR_NUMBER}"
git fetch origin \
  "+refs/pull/${PR_NUMBER}/head:${PR_REF}"

PR_SHA="$(git rev-parse "$PR_REF")"
PR_SHORT_SHA="$(git rev-parse --short=9 "$PR_REF")"
```

The `refs/pull/...` syntax is specific to some Git hosts. For other hosts or branch-based PRs, fetch the
PR's exact head SHA into an equivalently named local ref.

Create and verify the detached worktree:

```bash
git worktree add --detach "$WORKTREE" "$PR_REF"
mkdir -p "$ARTIFACT_ROOT"

git -C "$WORKTREE" status --short
git -C "$WORKTREE" rev-parse HEAD
```

The worktree must be clean and its SHA must match the PR head reported by the hosting provider.

## Phase 4: Design The Isolated Compose Project

Create a stable project name per repository and PR so later PR commits can reuse the isolated test
data intentionally:

```bash
PROJECT_NAME="$(printf '%s-pr%s' "$REPO_NAME" "$PR_NUMBER" \
  | tr '[:upper:]_' '[:lower:]-' \
  | tr -cd 'a-z0-9-')"
```

Use the PR worktree's Compose files so relative build contexts and source/config mounts refer to PR
files. If the worktree does not contain required ignored configuration such as `../../../.env`, reference it
explicitly from the main checkout with `--env-file`; do not copy it:

```bash
COMPOSE_FILES=(-f "$WORKTREE/docker-compose.yml")
ENV_ARGS=()
if [ -f "$REPO_ROOT/.env" ]; then
  ENV_ARGS=(--env-file "$REPO_ROOT/.env")
fi
```

Create an override under `ARTIFACT_ROOT`, not in either Git checkout:

```text
$ARTIFACT_ROOT/docker-compose.isolate.yml
```

The override must account for every collision and shared-data path.

### Images And Build Targets

Assign every locally built affected service a unique SHA-tagged image:

```text
<repository>-pr<PR>-<service>:<short-sha>
```

Example:

```yaml
services:
  web:
    image: example-pr123-web:abc123def
    build:
      context: /absolute/path/to/worktree
      dockerfile: web/Dockerfile
  worker:
    image: example-pr123-worker:abc123def
    build:
      context: /absolute/path/to/worktree
      dockerfile: worker/Dockerfile
```

Do not assume one image. Discover web, API, worker, scheduler, migration, proxy, or other services
that need rebuilding. Unchanged third-party dependencies may retain their normal upstream images.

### Host Ports

Assign unique host ports for every published port, or remove unnecessary dependency ports from the
host while keeping them available on the isolated Compose network.

Use `PORT_REGISTRY` (defined in Phase 2) as a cache in front of live discovery, not a replacement
for it — the registry avoids re-probing every run, but a recorded port is only ever reused after
confirming it is actually free right now.

```yaml
# .git/safe-docker-pr-testing-ports.yaml
# Auto-maintained by the safe-docker-pr-testing skill. Safe to delete; ports are rediscovered
# on the next run. Keyed by PR number, then by service name.
123:
  web: 3201
  postgres: 25432
456:
  web: 3301
```

Resolution order for each published port:

1. Read `PORT_REGISTRY` if it exists. If the current `PR_NUMBER` has a recorded port for this
   service, tentatively reuse it.
2. Inspect current listeners to verify. This surfaces conflicts from any running stack, not just
   the normal one, including other PR stacks already under test:

   ```bash
   docker ps --format '{{.Names}} {{.Ports}}'
   lsof -nP -iTCP -sTCP:LISTEN
   ```

3. If the recorded port is free, or is already held by this same PR's own containers (for example
   during Phase 10's update-on-new-commit), reuse it as-is — no reprobing needed.
4. If the recorded port is now held by something else (another PR's stack, an unrelated process),
   treat the registry entry as stale and fall back to fresh discovery: start from a base offset (for
   example, derived from the PR number) and probe upward, skipping any port already bound per the
   listener check above, until a free one is found.
5. If the PR has no registry entry yet, go straight to fresh discovery from step 4.

Do not hardcode a fixed port per PR outside of what the registry records, and do not prompt the user
to pick a port manually; only stop and ask if no free port turns up in the expected range after a
reasonable number of attempts. After the final ports are chosen, write/update this PR's entry in
`PORT_REGISTRY` (creating the file if absent) so later runs — including Phase 10 updates and future
test sessions for the same PR — resolve to the same ports deterministically. Do not remove a PR's
registry entry during Phase 11 teardown; the containers are gone but the reservation staying in
place is what keeps re-testing the same PR later deterministic, and step 4 above already handles the
case where another PR needs that port in the meantime. Always report every final chosen host port,
and whether it came from the registry or fresh discovery, in the Reporting Template.

Use `!override` to replace, rather than append to, existing port lists:

```yaml
services:
  web:
    ports: !override
      - "3201:3000"
  postgres:
    ports: !override
      - "127.0.0.1:25432:5432"
```

### Container Names

Compose project scoping automatically isolates generated container names. Explicit `container_name`
values bypass that scoping and will collide. For every service with `container_name`, override it
with a unique project-prefixed value:

```yaml
services:
  api:
    container_name: example-pr123-api
```

Do not start the stack while any fixed container name still matches an existing container.

### Networks

Let Compose create the default project-scoped network. Inspect custom networks for explicit `name`
or `external: true`; these may connect the PR to an existing stack. Replace them with project-scoped
networks unless shared external networking is an explicit test requirement.

### Volumes And Bind Mounts

Compose automatically prefixes ordinary named volumes with the project name. This is safe only when
the top-level volume does not specify an explicit `name` and is not `external`.

Reject or override any mutable storage that points to existing data:

- bind-mounted databases;
- uploads and user files;
- search indexes;
- object-store data;
- explicit named volumes;
- external volumes;
- host cache directories that contain runtime state.

Replace mutable bind mounts with isolated named volumes or directories under `ARTIFACT_ROOT`. Keep
only required read-only configuration mounts from the main checkout.

When replacing service volumes, use `!override` and restate the complete safe list so the normal
mutable mounts are not accidentally retained.

### Migrations

Automatic migrations are safe only after confirming all database and analytics storage endpoints
resolve to isolated services/volumes. Enable required migrations for fresh storage. Never point PR
migrations at the normal environment.

## Phase 5: Validate Isolation Before Building

Render the merged configuration:

```bash
ISOLATE_COMPOSE="$ARTIFACT_ROOT/docker-compose.isolate.yml"

docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  config --quiet

docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  config > "$ARTIFACT_ROOT/merged-compose.yml"
```

Inspect the merged configuration and stop unless all are true:

- project name is unique;
- application image tags are PR/SHA-specific;
- build contexts point at the PR worktree;
- all published host ports are unused and unique;
- no explicit container name collides;
- no external/shared network connects to the normal stack unintentionally;
- no explicit/external volume reuses normal data;
- no mutable bind mount points at normal data;
- database, cache, object storage, and queue URLs use isolated service names;
- secrets are referenced securely without being copied;
- migration commands target only isolated storage.

Also compare labels/resources from the normal project. A full-isolation test must be able to run
concurrently without modifying the normal project.

## Phase 6: Build Unique PR Images

Build only the affected local services, using the isolated configuration:

```bash
docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  build <service-a> <service-b>
```

For long builds, build services separately so a timeout does not hide which image completed.

Only pass build arguments supported by the Dockerfile. A successful image build validates
compilation/packaging, not runtime behavior.

Verify images before starting anything:

```bash
docker image inspect <unique-pr-image-a>
docker image inspect <unique-pr-image-b>
```

If corporate TLS/Corepack/package-manager behavior requires a test-only Dockerfile adjustment,
prefer a derived Dockerfile under `ARTIFACT_ROOT`. Do not commit the workaround or silently change
the PR. Document the difference in the final report.

## Phase 7: Start The Full Isolated Stack

Start with `--no-build` so Compose cannot replace the verified images unexpectedly:

```bash
docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  up -d --no-build
```

Do not run `down`, `stop`, or `up --force-recreate` against the normal project.

Verify all created containers carry the isolated project label:

```bash
docker ps -a \
  --filter "label=com.docker.compose.project=$PROJECT_NAME" \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

## Phase 8: Verify Runtime And Isolation

Before asking for manual testing, verify:

1. all required services are running/healthy;
2. application containers use the exact SHA-tagged PR images;
3. health/readiness endpoints succeed;
4. required migrations completed against fresh isolated storage;
5. logs show dependency connections and readiness;
6. isolated volumes/networks exist under the PR project name;
7. the normal containers, images, volumes, ports, and data remain unchanged;
8. the main checkout is unchanged;
9. the worktree SHA still matches the tested PR SHA.

Typical commands:

```bash
docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  ps

curl --fail <isolated-health-url>

docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  logs --no-color --tail=200

docker volume ls --filter "name=$PROJECT_NAME"
docker network ls --filter "name=$PROJECT_NAME"
git status --short
git -C "$WORKTREE" status --short
git -C "$WORKTREE" rev-parse HEAD
```

Do not claim end-to-end success when authentication, browser interaction, hardware, or an external
service still requires manual validation. State exactly what was automated and what remains.

## Phase 9: Test PR-Specific Behavior

Derive test cases from the PR description, changed code, existing tests, and review findings.

Testing order:

1. focused automated tests documented by the PR;
2. production image/runtime smoke test;
3. changed behavior through its public interface;
4. at least one relevant failure or boundary condition;
5. authorization and tenant-isolation checks where applicable;
6. persistence and logs after the test.

Store generated fixtures under `ARTIFACT_ROOT` or in the isolated application's data stores. Do not
write fixtures into the main checkout. Clearly distinguish synthetic fixtures from realistic user
acceptance tests.

If local configuration blocks the feature, use another temporary override under `ARTIFACT_ROOT`.
Do not edit tracked files in the main checkout. Record any difference between the tested image and
the PR source.

## Phase 10: Update An Active PR Test

When the PR receives a new commit:

1. record the currently running image tags and head SHA;
2. fetch the new head into the same named PR ref;
3. inspect the delta before rebuilding;
4. ensure the worktree contains no unrecorded changes;
5. move the detached worktree to the new PR ref;
6. derive new SHA-tagged image names;
7. update only the external isolation override;
8. reuse this PR's ports from `PORT_REGISTRY` (Host Ports, Phase 4) rather than re-probing — they
   are still bound by this same PR's own containers until step 9 recreates them;
9. build new images;
10. run `up -d --no-build` with the same project name;
11. preserve the isolated volumes unless a fresh-data test is explicitly required;
12. verify the containers use the new image tags and re-run affected tests.

Example fetch/update:

```bash
git fetch origin \
  "+refs/pull/${PR_NUMBER}/head:${PR_REF}"

NEW_PR_SHA="$(git rev-parse "$PR_REF")"
git -C "$WORKTREE" switch --detach "$PR_REF"
```

Do not delete old PR images until the updated stack is healthy. They are the rollback path for the
isolated test environment.

## Phase 11: Tear Down And Clean Up

Cleanup may delete the isolated test data, but only after verifying the exact project name and
resources.

List scoped resources first:

```bash
docker ps -a --filter "label=com.docker.compose.project=$PROJECT_NAME"
docker volume ls --filter "name=$PROJECT_NAME"
docker network ls --filter "name=$PROJECT_NAME"
```

If the user approves deleting the isolated test data, remove only the isolated project:

```bash
docker compose \
  --project-name "$PROJECT_NAME" \
  "${ENV_ARGS[@]}" \
  "${COMPOSE_FILES[@]}" \
  -f "$ISOLATE_COMPOSE" \
  down -v --remove-orphans
```

Remove only the SHA-tagged images created for this PR. Never use wildcard or broad prune commands:

```bash
docker image rm <unique-pr-image-a> <unique-pr-image-b>
```

Remove the worktree and artifacts after containers no longer use them:

```bash
git worktree remove "$WORKTREE"
git worktree prune
```

Delete only the known files created under `ARTIFACT_ROOT`, then remove that empty directory. If a
temporary `TEST_ROOT` was created, remove it only after verifying it contains no unrelated files.

Final checks:

```bash
git worktree list
git status --short
docker ps -a --filter "label=com.docker.compose.project=$PROJECT_NAME"
docker volume ls --filter "name=$PROJECT_NAME"
docker network ls --filter "name=$PROJECT_NAME"
```

Confirm the normal environment still exists in the same state recorded before the test.

## Reporting Template

After testing:

```text
PR: <URL/number>
PR commit: <full SHA>
Worktree: <path>
Compose project: <unique project name>
PR images: <unique tags>
Application URL: <isolated URL>
Ports: <host ports, one per service, each noting registry reuse or freshly discovered>
Isolation checks: ports / containers / networks / volumes / data
Normal environment unchanged: yes/no
Automated checks: <results>
Manual checks remaining: <steps>
Test-only build differences: <none or documented workaround>
Residual risks: <review findings or gaps>
Cleanup command: <exact scoped command>
```

After cleanup:

```text
Isolated containers removed: yes/no
Isolated volumes removed: yes/no
Isolated network removed: yes/no
PR images removed: yes/no
PR worktree removed: yes/no
Temporary artifacts removed: yes/no
Main checkout unchanged: yes/no
Normal environment unchanged: yes/no
```

## Failure Handling

- Fetch fails: use documented authentication/CA configuration; do not disable TLS globally.
- Worktree checkout stalls in OneDrive: hydrate Git objects or use an independent clone outside the
  synced directory; do not keep retrying indefinitely.
- Build fails: leave both normal and existing isolated containers untouched and report the stage.
- One service build times out: inspect image existence and resume only incomplete services.
- Compose merge retains fixed container names/shared ports/shared volumes: do not start the stack;
  correct the isolation override.
- A mutable bind mount points at normal data: replace it with isolated storage before starting.
- Container startup runs migrations against a non-isolated endpoint: stop the isolated project
  immediately and report the risk.
- Health passes but feature fails: preserve logs and distinguish PR defects from local dependency
  failures.
- PR receives a new commit: inspect the delta, retag images by SHA, and preserve old images until the
  update is verified.
- Cleanup target is ambiguous: stop and resolve the exact project/image/worktree identifiers first.
