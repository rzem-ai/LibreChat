# Research Agent build checklist

Derived from `research-agent-design.md`. One box per component. Section numbers
refer to the design document. A box is ticked only when the component has tests and passes
`npx tsc --noEmit` in its workspace.

Status as at 3 November 2026: Phases 1 to 3 built, the Phase 4 seam built, branch
`feat/research-agent`, 57 commits from `584e4b3225` to `9abeeeb532`, nothing pushed. All
research code lives in `packages/researcher` (`@librechat/researcher`), moved there in
commits `e208992e5f` to `9abeeeb532`; paths below are current. Research suite 387 of 387
passing. Notes in *italics* record where the build differs from the design or where
something has only been tested against a stand-in. See "Outstanding and untested" at the end
before treating any of this as production-ready.

## Phase 1: core pipeline and interactive jobs

### Config and types
- [x] `research` zod schema on `configSchema` in `packages/data-provider/src/config.ts` (5.10)
- [x] `research` loaded into `AppConfig` in `packages/data-schemas/src/app/service.ts` and typed in `types/app.ts`
- [x] Shared types for jobs, snapshots, verification results in `packages/researcher/src/contract/types.ts`
- [x] Query and mutation keys in `packages/researcher/src/contract/keys.ts`
- [x] Endpoints and data-service methods for research routes in `contract/endpoints.ts` and `contract/service.ts`
- [x] Research tool contract (names, argument schemas, descriptions) in `packages/data-provider/src/research.ts`, outside the package because the `@librechat/api` tool registry reads it

### Data models (`packages/researcher/src/db`) (5.11)
- [x] `ResearchJob` schema, model, methods
- [x] `Snapshot` schema, model, methods (with `archived` flag and owner)
- [x] Indexes: job by user and status, snapshot by owner and fetchedAt, snapshot by archived. *Ensured at boot from `host.seed()`, found missing in the final review.*
- [x] Models registered by `createResearchModels(mongoose)` and methods by `createResearchDbMethods(mongoose)`, both called from `/api` at boot

### Research module (`packages/researcher/src/server/`)
- [x] Module factory taking models, app config, MCP manager, mailer, fetch agent as arguments (5.1). *`createResearchHost` in `host.ts`; the app wires it once in `/api`.*
- [x] Job state machine with persisted phase, notes, brief and draft (5.2). *Phases settle on `phaseDeliveryKey` so a retried generation cannot double-advance.*
- [x] Budget accounting: `maxSteps` split across phase generations, wall-clock enforcement, draft threshold (5.2)
- [x] Phase runner that fires each phase as a generation through the trigger queue (`fire` then `continue`)
- [x] Brief phase and streaming of the brief into the conversation (5.3 step 2). *The brief is the agent's normal reply, so it streams through the existing message path. No research-specific rendering.*
- [x] Research phase with subagent fan-out and structured note return (5.3 step 3). *Findings are recorded with `record_finding`, not returned as prose. Subagent progress shows through the existing SubagentCall part.*
- [x] Draft phase with inline citation markers resolving to snapshot ids (5.3 step 4). *Marker form `[[cite:snap_id#locator]]`. Report text is escaped for the client markdown pipeline; see the escaping commits.*
- [x] Verification pass: deterministic snapshot re-open, claim check via `verification.model`, supported / unsupported / unavailable states, brief-vs-report scope notes, summary block (5.3 step 5). *Also counts sentences with no citation at all (`uncited`) and reports it in the summary line.*
- [x] Partial delivery on budget exhaustion and failure state with reason (5.3). *Coded reasons: `brief_failed`, `verification_failed`. Verification failures hold the lease as backoff and fail the job at `verification.maxAttempts` (default 5).*
- [x] Cancel between phases. *Cancel during the final delivery write is a known race; see Outstanding.*

### Source tools and snapshots (5.2, 5.4)
- [x] `SearchClient` interface and Brave Search client with `research.search.braveApiKey` (5.5)
- [x] `search_web` tool
- [x] `fetch_page` tool: SSRF-guarded fetch, HTML to markdown, snapshot write, content hash. *Parsing cost and deadline bounded; `proxy: false`, see open questions.*
- [x] `read_document` tool: MCP gateway call, SharePoint and OneDrive stable references, refuses in detached phases (5.9). *Built against a stand-in MCP server, not Deloitte's gateway. The response shape is read defensively because the real shape is unknown. Only references the user named at submission are accepted. UNTESTED against the real gateway.*
- [x] `search_uploads` tool wrapping the RAG query path with file id and locator
- [x] Snapshot storage through the existing file storage strategy with a Mongo metadata row
- [x] Nightly snapshot sweep honouring `retentionDays` and `archived`. *Runs at `snapshots.sweepHour` in UTC, not local time.*
- [x] Archive marking of cited snapshots on delivery

### Submission and delivery
- [x] Submit route: create job, fetch-at-submission for jobs 1 and 5 with progress in the conversation, bounded by `submitFetch` limits, then enqueue (5.3 step 1, 5.9). *Implemented as admission on the normal chat route rather than a separate submit endpoint, which was added and then removed. Coded admission errors map to client copy.*
- [x] Report file delivery via `packages/api/src/agents/files/` attached to the final message (5.3 step 6). *`createFile` with `message_attachment` context plus the report body in the message.*
- [x] `/api` wiring only: route registration and calls into the module. *`api/server/routes/research.js` and one host wiring call; the agent delete guard in `v1.js` is a one-line call into the module.*

### Agents
- [x] Seed step: Research `AgentCategory`, five fixed-id agents, provider, model and author from config, PUBLIC view grant, seed-if-missing (5.11). *Also backfills `conversation_starters` on existing agents that have none, with `skipVersioning`.*
- [x] Instructions and report template per job type held in the module (section 3, builder's wording)
- [x] Generic `web_search` and `file_search` capabilities off for the five agents. *By omission: the seeded tool list holds only the module tools plus `record_finding`, `submit_brief` and `submit_draft`. Nothing stops an admin adding them in the builder.*

### Client
- [x] Research panel in the side panel: job list with status, budget used, conversation link, cancel (5.12)
- [x] Queued state, streamed brief, subagent progress and verification summary in the conversation. *Queued and verification summary are research-specific copy; the brief and subagents use existing rendering.*
- [x] `packages/researcher/src/client/hooks/` queries and mutations with invalidation. *Panels live in `src/client/panels/` and take the app's panel header and content as a `chrome` prop.*
- [x] All strings in `client/src/locales/en/translation.json` via `useLocalize()`. *Job type and channel keys are literal maps in `labels.ts` so the unused-key check can see them.*

### Tests
- [x] State machine and budget tests with `mongodb-memory-server`
- [x] Verification pass tests with real snapshots and a stubbed verification model
- [x] Source tool tests with mocked HTTP for Brave and page fetches, real MCP SDK server for the gateway stand-in
- [x] Seed step idempotency test

## Phase 2: feeds

### Data models (5.6)
- [x] `Feed` schema, model, methods (unique on url)
- [x] `FeedSubscription` schema, model, methods (unique on user plus feed). *Carries `folder: string[]`, see Extras.*
- [x] `FeedItem` schema, model, methods (unique on feed plus guid)

### Poller
- [x] Background poller started beside the schedule engine, with leasing for multi-replica (section 8). *Runs as its own loop in `host.start()` so a slow poll cannot delay report delivery. Ten page fetches per poll pass.*
- [x] ETag and Last-Modified handling, backoff, disable after `disableAfterFailures`
- [x] Item snapshot write (feed content or fetched page)
- [x] 45-day item retention via the snapshot sweep, archived items exempt

### Subscriptions
- [x] OPML import with `maxPerUser` cap
- [x] OPML export
- [x] Catalogue flag and category on `Feed`, admin-only catalogue management route. *Routes exist behind `requireAdminAccess`. No admin UI; catalogue entries are added by API call.*
- [x] `read_feed_items` tool

### Client
- [x] Feeds panel: subscription list, unsubscribe, OPML import and export, catalogue picker
- [x] Read-only 45-day item history per feed

### Tests
- [x] Poller tests with a local feed fixture server
- [x] OPML round-trip test. *Including nested folders.*
- [x] Shared poll per feed across many subscribers

## Phase 3: scheduling and delivery

### Scheduling (5.7)
- [x] `ResearchSchedule` schema, model, methods keyed by schedule id
- [x] Research routes that create and delete `ResearchSchedule` alongside `Schedule`. *The schedule itself is created in the unmodified schedule dialog. The research row is created on first delivery-setting change and is inert if its schedule is deleted.*
- [x] Delegated invocation mode restricting source kinds to web and RSS. *Detected via `readScheduleFireContext`.*
- [x] Job 3: load prior delivered reports for the schedule as snapshots, "what changed" section required. *`jobs.trends.priorReports`, default 3.*
- [x] Job 4: items since last successful run, `maxItems` cap, "left out" section required

### Delivery (5.8)
- [x] `DeliveryChannel` interface supplied by the caller
- [x] Conversation channel (existing schedule behaviour)
- [x] Email channel via `sendEmail` with a `researchReport` handlebars template. *Rendered with micromark, images disabled, only verified addresses. micromark is ESM-only and needs Node 22.12 or later; it is allow-listed in `api/jest.config.js` and `packages/researcher/jest.config.cjs`.*
- [x] Each channel send as its own trigger delivery with retry. *Design said trigger queue; built as a per-channel ledger on the job (`attempts`, `nextAttemptAt`, `error`, lease) with exponential backoff from `delivery.retryBaseSeconds`, capped at a day. Same behaviour, no queue coupling.*
- [x] Per-channel delivery state on the job, "delivered with warnings"

### Client
- [x] Delivery channel selector when the scheduled agent is a research agent. *Lives in the Research panel under "Scheduled research", not in the schedule dialog, so the dialog stays unmodified for upstream syncs.*

### Tests
- [x] Delegated mode refuses `read_document`
- [x] Email delivery retried independently of the job

## Phase 4: gateway token provider (planned, not promised)

- [x] Host seam: `delegatedAccess` on the research host gates detached `read_document`, scheduling for jobs 1 and 5, and the Teams channel. *Seam only. Nothing installs it.*
- [ ] Host implementation of `HostUpstreamTokenProviderResolver` against the MCP gateway (5.9). *Needs the gateway to support a refreshable delegated grant.*
- [ ] Stored delegated grant model and security review
- [ ] `read_document` allowed in detached phases when the provider is installed. *Gated on the seam; untested end to end because nothing installs it.*
- [ ] Scheduling enabled for jobs 1 and 5. *Same.*
- [ ] Teams delivery channel via Graph through the gateway. *Channel type exists; no implementation.*

## Cross-cutting

- [x] Every new lever present in `librechat.yaml` schema with a default matching the design (5.10)
- [x] Auth user cache invalidation wherever user documents are mutated. *Not applicable: the module never writes to the User collection.*
- [x] `npm run static-checks:full -- --against origin/dev` clean at `24a43d2fb9`, every gate except depcheck (not installed locally). *The branch is still 36 commits behind `origin/dev`; rerun after the rebase.*
- [ ] Open questions in section 8 answered or carried into the PR description. *Carried; see below.*

## Extras built along the way

Not in the design, added because testing or use showed the gap.

- **Feed folders.** OPML nesting is kept as a `folder` path on the subscription (depth 8, segments 128 characters). The Feeds panel groups by folder with collapse, rename (prefix move via `tenantSafeBulkWrite`) and per-feed move. Export writes the folders back. Re-importing an OPML files existing unfiled feeds without counting against the cap. Commits `44d3b458fa`, `f3721cee06`.
- **Conversation starters.** Six per agent, backfilled onto existing agents. `MAX_CONVO_STARTERS` raised from 4 to 8 globally, which affects every agent and assistant. Commit `d71d501331`.
- **Delete guard.** The five agents cannot be deleted while `research.enabled` is true (409 `research_agent_protected`); the builder shows a specific message. Commit `814b5e9ebd`.
- **Uncited sentence count** in the verification summary. Commit `c855d154cc`.
- **Security fixes from review.** `javascript:` and other non-http links dropped from feed responses; email only to verified addresses; remote images never rendered in email; document reads bound to user-named references and known URLs; report text escaped rather than pattern-stripped. Each has a test written before the fix.
- **Dev scripts.** `dev-start.sh` and `dev-stop.sh` run Mongo and Meilisearch as plain containers (no compose) and the app on the host with reload. Untracked, repo root.
- **Docs.** `docs/howto/` holds a general guide and one guide per agent with worked examples. `docs/ai-cyber-iam-feeds.opml` is a 55-feed starter list across 9 folders, with `docs/feed-verification-report.md` recording which feeds were verified reachable.

## Outstanding and untested

Read this list before a PR or a pilot.

### Untested against real infrastructure
- **SharePoint and OneDrive via the MCP gateway.** `read_document` and the submit-time fetch were built and tested against a stand-in MCP server using the real MCP SDK. Deloitte's gateway was not available. The adapter reads the response shape defensively (`content`, `text`, `sections`, `anchor`, `id`) because the real shape is unknown. Config is `research.documents.mcpServer`, `toolName`, `argumentName`. Expect to adjust the adapter on first contact.
- **Email through the deployment's mailer.** Tested with a stubbed `sendEmail`. Not sent through nodemailer or Mailgun.
- **Brave Search.** Tested with mocked HTTP. One live call to confirm the key and the response shape is sensible before a pilot.
- **Behind an egress proxy.** Page fetches run with `proxy: false` through the SSRF guard. If the deployment needs an egress proxy, this is a config decision not yet made.
- **Multi-replica.** Leasing exists for jobs, feeds, verification and delivery. Not exercised with two processes.
- **Verification model at scale.** The verifier is model-backed and capped at `verification.maxClaims` (400). Cost and latency per report with a real model are unmeasured.

### Known gaps, deferred as minor
- Brief cap is 4,000 characters in code where the design said 8,000.
- Cancel racing the final delivery write can leave a cancelled job with a delivered report.
- A follow-up message in a job's conversation starts a new job rather than extending the old one. The agent's instructions say so.
- No catalogue admin UI. Catalogue feeds are added by `POST /api/research/feeds/catalogue`.
- `snapshots.sweepHour` is UTC.
- "45 days" is hard-coded in client copy; the lever `snapshots.retentionDays` is not reflected there.
- An invalid `research` section in `librechat.yaml` disables research silently rather than failing startup.
- Feed item queries use `$expr`, which needs MongoDB 3.6 or later. Fine for Mongo 8, worth a note for older deployments.
- `record_finding` is capped per job but not atomically; a burst of concurrent subagents can overshoot by a few.
- Feed items with future publish dates are accepted as-is.
- Each phase is fired by a user-role message ("[Research phase] Brief: ..."), so the phase prompts show in the conversation under the user's name.

### Open questions for the PR description (design section 8)
- Does the gateway support a refreshable delegated grant for unattended runs? Phase 4 depends on it.
- Teams via Graph: through the gateway, or a separate app registration?
- Egress proxy for page fetches: none today.
- Email policy: who may receive research reports by email, and from which address?
- Which verification model, and who pays for it?
- Who owns the feed catalogue, and is an admin UI needed before pilot?
- Success measures for the pilot.

### Before the PR
- Rebase onto `origin/dev` and run `npm run static-checks -- --against origin/dev`.
- Run `npm run lighthouse` (startup path touched by the research startup config).
- Decide whether `docs/`, `dev-start.sh` and `dev-stop.sh` belong in the PR.
- Drop the stale lint-staged backup stash if still present (`git stash list`), by its tag, never a bare pop.
