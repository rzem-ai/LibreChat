# End-to-end tests

We drive the LibreChat app the way a real user would — clicking buttons, typing into forms, waiting for streamed responses — and assert that the app behaves correctly at every layer from the browser down to MongoDB. Built with [Playwright](https://playwright.dev/), the suite is split into **three primary lanes** (CI/Smoke, Mock, Real) plus a separate **Live** suite that targets an already-running environment.

## Design principles

> **1. Fake only at the boundary.** Real Express, real Mongoose, real React, real Playwright. The LLM and MCP boundaries are the *only* things we stub, and only in the mock lane.
>
> **2. Deterministic by default.** If a fake can satisfy the assertion, the assertion belongs in the mock lane. Real-lane tests must depend on behavior only a real provider can produce.
>
> **3. Every test earns its slot.** Bug regressions cite their ticket. Feature acceptance tests survive after the feature ships. Anything else gets deleted or moved to `deprecated/`.

## The three primary lanes at a glance

```
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │   CI/Smoke   │  │     Mock     │  │     Real     │
           └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
Browser           │ real            │ real            │ real
Frontend          │ real            │ real            │ real
Backend           │ real            │ real            │ real
Database          │ in-memory Mongo │ in-memory Mongo │ persistent Mongo
LLM               │ ✕  none         │ ★  fake         │ ✓  real
MCP               │ ✕  none         │ ★  fake :8765   │ ✓  real
Secrets           │ generated       │ generated       │ real
```

| | **CI / Smoke** | **Mock** | **Real** |
|---|---|---|---|
| Path | `specs/` | `specs/mock/` | `specs/real/` |
| Config | [`playwright.config.ts`](../playwright.config.ts) | [`playwright.config.mock.ts`](../playwright.config.mock.ts) | [`playwright.config.real.ts`](../playwright.config.real.ts) |
| Run | `npm run e2e:ci` | `npm run e2e:mock` | `npm run e2e:real` |
| Backend | Real (spawned) | Real (spawned) | Real (spawned or remote) |
| Database | In-memory Mongo | In-memory Mongo | Real / persistent |
| Frontend | Real | Real | Real |
| LLM | `user_provided` — no real calls | Fake (deterministic hook) | Real (OpenAI / Azure / etc.) |
| MCP servers | None injected | Fake server on `:8765` | Real MCP servers |
| Secrets | Fresh per run | Fresh per run + `.env` secrets blanked | Real secrets required |
| Determinism | High for UI checks | High | Low |
| Speed | Fast | Fast | Slow |
| Cadence | Every PR | Every PR | Nightly / on-demand |

## Why three lanes

**CI / Smoke** is the "did the build survive?" gate. It boots the app, verifies the shell renders, checks the auth guard, opens the settings modal, opens the model picker. If a smoke test is red, nothing else matters — don't merge. Fast, near-zero flakiness, no LLM required.

**Mock** is the regression workhorse. Every layer of the stack is exercised for real — real Express middleware, real Mongoose validation, real React rendering, real Playwright browser — with only the LLM and MCP boundaries faked. This is where most new tests live: bug regressions, feature acceptance, edge cases. Deterministic, cheap, no external services.

**Real** is the "does it still work end-to-end with actual providers?" check. It hits OpenAI/Azure/Anthropic and real MCP servers. Slow, costs tokens, catches drift between fake and real model behavior. Run nightly or on-demand, never as a PR gate.

## How the environment is set up

Regardless of lane, each Playwright run boots a full LibreChat backend with a real database:

- **Backend**: spawned by [setup/start-server.js](../setup/start-server.js), triggered from the config's `webServer` block. Playwright waits for the server to respond before starting tests.
- **Database**: fresh in-memory MongoDB via [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server). Downloads `mongod` on first run, caches it after. Each Playwright run gets a clean, isolated DB.
- **Auth**: [setup/authenticate.ts](../setup/authenticate.ts) runs once before the suite, registers a test user, logs them in, and stores the browser context in `e2e/storageState.json`. Tests reuse that state so they start already logged in.
- **Config**: LibreChat loads its usual [librechat.yaml](../../librechat.yaml) with model specs, agents, and MCP servers wired up.

### Mock-specific setup

Two things flip on when you run the mock lane:

1. **Fake LLM** — [`setup/fake-model.js`](../setup/fake-model.js) is injected via the `LIBRECHAT_TEST_RUN_HOOK` env var. It replaces the real provider client with a deterministic implementation that emits predictable text chunks. Tests assert on markers like `chunk-010` or sentinel strings like `E2E_ASSERT_PROVIDER_FILE:<filename>` — no real API call ever leaves the process.
2. **Fake MCP server** — [`setup/fake-mcp-http-server.js`](../setup/fake-mcp-http-server.js) runs on port `8765` and answers tool calls with canned responses. Lets us exercise the tool-call pipeline without depending on external MCP infrastructure.

Credential env vars matching common secret patterns (`API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIALS`, `CLIENT_ID`) are blanked in the mock config so a mis-configured local env can't leak.

## The Playwright configs

All three configs share the same server-spawn logic, the same storageState-based auth, and the same in-memory Mongo. The only differences: which test directory they scan, and which env vars they inject. The mock config layers on the fake LLM hook and blanks credential env vars; the real config expects real secrets in `.env`; the CI config does neither.

## Running the suites

The `npm run` scripts in the table above are the canonical entry points — each runs [`e2e:prepare`](../../package.json) first (builds the client bundle), then hands off to Playwright.

For interactive debugging in Playwright's UI mode, swap the config to target the lane you want:

```bash
E2E_BASE_URL=http://localhost:3333 npx playwright test --config=e2e/playwright.config.mock.ts --ui
```

## What each lane covers

### CI / Smoke — `specs/`

Every test in this folder must be **fast, deterministic, and diagnostic**. If it fails, the app is broken in a way that would waste everyone's time downstream.

Current coverage:

- **App load** — authenticated landing renders the chat shell without console or page errors; `/c/new` navigation works.
- **Auth guard** — unauthenticated visits to `/` and `/c/new` redirect to the login page.
- **Model picker** — the model spec selector opens and renders at least one option, proving `librechat.yaml` was loaded.
- **Settings modal** — opens from the user menu, renders its tabs, closes cleanly.

### Mock — `specs/mock/`

Where regression pins for bug fixes live, and where feature acceptance tests land after a feature ships. Loosely grouped by area:

- **Chat lifecycle** — streaming, branching, regeneration, attachments, message tree edge cases.
- **Agents** — creation, persistence, cross-owner file access, tool configuration.
- **Model specs** — enforcement, branding, icons, starter prompts, spec-scoped skills.
- **MCP** — tool selection, allowlist overrides, ephemeral MCP state across model switches.
- **Auth and isolation** — session persistence, expired-bearer recovery, cross-user data isolation.
- **Permissions and sharing** — shared links, permission cache invalidation, project scoping.
- **Editor features** — prompt manager, skill authoring, memory, quotes, steering.

#### Example — the attachment preview loop regression

[`specs/mock/attachment-preview-loop.spec.ts`](mock/attachment-preview-loop.spec.ts) reproduces a specific React re-render loop (React error #185) that occurred when a conversation loaded with a pending large-document attachment. The test seeds a conversation into the in-memory Mongo, loads it in the browser, and asserts the app doesn't crash. If the loop ever returns, this test fails on the PR. That's a **regression pin** — a test whose only job is to prevent a specific bug from coming back.

#### Example — the agent-file-ownership permission test

[`specs/mock/agent-file-ownership.spec.ts`](mock/agent-file-ownership.spec.ts) seeds an agent owned by user A whose attached files are owned by user B. It verifies that user A (the agent's author) can list, preview, and use those files — the fork-specific permission model that lets agent authors access files their agent owns even when the file belongs to another user. This exercises the real ACL system end-to-end without needing any external service.

### Real — `specs/real/`

Small, high-signal, expensive. Guarded so it never runs on PRs by accident.

Intended coverage:

- Real streaming end-to-end against a live provider.
- Real tool use through a real MCP server.
- Real token-usage tracking accuracy.
- Real RAG retrieval against the `rag_api` service.

## Adding a new test — quick decision guide

- **Fixing a bug?** → Write a regression pin in `specs/mock/` that fails before your fix and passes after. Reference the ticket in the test name.
- **Shipping a feature?** → Write acceptance tests in `specs/mock/` covering the happy path and one or two key edge cases.
- **Blocked something at the shell level?** (login broken, model picker empty, settings modal won't open) → Add a check in `specs/` so we catch it before anything else runs.
- **Validating a provider integration?** → Add to `specs/real/` and make sure the CI workflow that runs it is guarded to nightly / on-demand.

## The `deprecated/` folder

Old test files that targeted removed UI (the pre-model-spec endpoint picker, BingAI/Sydney era settings, etc.) live in `specs/deprecated/` for historical reference. They are excluded from every Playwright config via `testIgnore` and never run. Safe to read for context, safe to delete when you're confident nothing else references them.
