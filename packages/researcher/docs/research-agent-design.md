# Research Agent for Deloitte Australia LibreChat

Date: 2026-10-30
Status: draft for review
Author: Angus, from a requirements session with Alex Rzemieniuk

## 1. Intent

Deloitte Australia staff need a way to hand a research task to LibreChat, walk away, and
come back to a finished report whose every claim traces to a source the agent actually read
during the run. Nothing comes from the model's own knowledge. Five distinct research jobs
share this pipeline, and two of them run on a schedule without the user present.

Scale: 1,000 users at first release, 2,000 by February 2027, up to 13,000 eventually. Every
default is chosen with the ceiling in mind, because per-user feeds and schedules multiply by
headcount.

The target codebase is Deloitte's LibreChat fork, which tracks this repository roughly two
weeks behind. Everything here builds on extension points that already exist in this
repository (schedule engine, trigger queue, subagents, MCP on-behalf-of exchange) so the
feature rides along with each sync instead of fighting it.

## 2. Goals, non-goals, anti-goals

### Goals

- Five research job types, each a first-class agent the user picks explicitly.
- Every output claim carries a citation to a source fetched during the run, and every
  citation is re-verified before delivery.
- Jobs run detached. The user submits, leaves, and is notified when the report is ready.
- Per-user RSS feed lists with 45 days of item history.
- Digest and trend jobs run on a schedule and deliver to the channels the user chose.
- Internal sources (SharePoint, OneDrive, LibreChat uploads) are read as the user, under
  on-behalf-of, interactively only.
- Every limit is operator-configurable in `librechat.yaml`.

### Non-goals (v1)

- Output formats other than markdown. Word, PDF and Deloitte templates come later.
- A free-text front door that guesses which job the user wants. The user picks the type.
- Unattended access to SharePoint or OneDrive. Scheduled jobs see RSS and web only.
- A custom notification centre in the client. Delivery uses a conversation plus optional
  email and Teams.
- Collaborative or shared reports. A report belongs to exactly one user.

### Anti-goals

These are the failure modes Alex named. The design treats each as a defect class with a
rule attached.

| Failure | Rule |
|---|---|
| Agent never returns | Every job has a wall-clock and step budget. When either runs out, the agent delivers what it has, marked partial. A job that ends with no output is a bug. |
| User gets another staff member's report | Reports, jobs, snapshots, subscriptions and schedules carry an owner user id and are queried by it. The only shared data is the raw feed poll cache, which is public RSS. |
| Report drifts from purpose | The agent writes a brief before researching. The user can see it. The final report is checked against the brief before delivery. |
| Agent loses focus | The brief governs subagents. Each gets one narrow task and its own budget. |
| Citations are wrong | A separate verification pass re-opens every cited snapshot and confirms the claim is there. Failures are flagged in the report, never silently kept. |

## 3. The five jobs

All five share the pipeline in section 5 and differ in prompt, allowed sources, output
template and whether they may be scheduled.

| # | Job | Input | Sources | Output | Schedulable |
|---|---|---|---|---|---|
| 1 | Requirements research | A set of specification documents (SharePoint, OneDrive or LibreChat uploads) and a question | Internal documents first, web only if the brief asks for it | Long-form report, citations point at document sections | No (needs OBO) |
| 2 | Current events research | A topic or question | Web search, optionally the user's feeds | Report on what is happening now, citations are URLs | Yes |
| 3 | Trend research over time | A topic tracked repeatedly | Web, feeds, and the user's earlier reports on the same topic | Report that states what changed since the last run | Yes |
| 4 | Daily digest | The user's feed list and a stated interest | RSS first, web to fill gaps | Short digest naming what was kept and why | Yes, this is its normal mode |
| 5 | Solution research | A problem description (what a client wants) | Web, vendor documentation, internal specs and prior work via SharePoint | One standout solution or several well-argued options, each with verified citations | No (needs OBO) |

Job 5 is reasoning towards an answer rather than summarising, so its prompt asks for
options, trade-offs and a recommendation, and its verification pass is the strictest.

## 4. Decisions already made

These came from Alex during the session and are not open.

- All five jobs ship in the first release.
- The user picks the job type first. Five agents in a "Research" agent category.
- No claim from model memory. Every claim cites a fetched source.
- Web and RSS sources are stored as a markdown snapshot of the page at fetch time.
- Internal document citations use stable references (item id plus section), not titles.
- Feed item history is kept for 45 days. An item that gets cited is marked archived and is
  never deleted.
- Scheduled runs may touch RSS and web only. SharePoint and OneDrive jobs run interactively.
- Jobs are detached. The user walks away and is notified.
- Delivery for scheduled output is a per-user choice from: LibreChat conversation, email,
  Teams, in any combination.
- Feed lists are built by OPML import, a Deloitte-curated catalogue, or both.
- Native output format is markdown.
- Search provider is Brave Search.
- LLMs come through Deloitte's LLM gateway. SharePoint and OneDrive come through an MCP
  gateway that performs on-behalf-of exchange.
- "LibreChat Files" means the user's own uploads, reached through the existing file search
  and RAG tooling. No new MCP server.

## 5. Architecture

### 5.1 Where the code lives

Everything research-specific lives in one workspace package, `packages/researcher`
(`@librechat/researcher`), with two entry points:

```text
packages/researcher/
├── src/
│   ├── index.ts      server entry: require('@librechat/researcher'), CommonJS
│   ├── server/       job pipeline, source adapters, snapshot store, citation verifier,
│   │                 feed poller, digest assembly, delivery, HTTP handlers
│   ├── db/           schemas, models and methods for the six research collections
│   ├── client.ts     client entry: '@librechat/researcher/client', ESM and CJS
│   ├── contract/     wire types, endpoints, React Query keys, data-service calls
│   └── client/       Research and Feeds panels and their hooks
└── test/             mirrors src/: server, db, contract, client
```

The package sits above `@librechat/api` in the dependency order, and nothing below it
imports it. Three pieces stay outside because core packages read them: the `research`
config schema and startup flag in `packages/data-provider/src/config.ts`, the config
loader in `packages/data-schemas/src/app/research.ts`, and the research tool contract
(names, argument schemas, descriptions) in `packages/data-provider/src/research.ts`, which
the `@librechat/api` tool registry needs.

`/api` gains route registration and wiring only: it registers the models with
`createResearchModels(mongoose)` at boot, merges `createResearchDbMethods(mongoose)` into
`~/models`, and builds the host with `createResearchHost`. The React app imports the
panels, `useResearchConversationSync` and `isSchedulableAgent` directly. It passes its own
`PanelHeader` and `PanelContent` to the panels as a `chrome` prop
(`client/src/components/SidePanel/Research.tsx`), so the package never imports the app.

The module takes its dependencies (models, app config, MCP manager, mailer, fetch agent) as
constructor arguments, following `createModels(mongoose)`, so it can be tested without a
running app.

### 5.2 Execution model

The research module owns the job loop. It is a state machine persisted on the `ResearchJob`
row, and each phase that needs a model runs as its own agent generation through the existing
trigger queue (`fire` for the first phase, `continue` for later ones). Notes, the brief and
the draft are persisted on the job between phases, so a phase can be retried, a job can be
cancelled between phases, and a budget exhaustion can skip straight to drafting from
whatever notes exist. The alternative, one long prompt-structured agent turn, cannot honour
the wall-clock budget or the partial-output guarantee, because a turn only has a superstep
limit and an abort throws the turn's work away.

Budgets map as follows. `maxSteps` is the job's total superstep allowance and is split
across phase generations by the module, each generation's `recursionLimit` set from the
remaining allowance and capped by the deployment's `maxRecursionLimit`. The wall-clock limit
is enforced by the module, which aborts the current generation when it is reached and moves
the job to drafting. Subagent budgets keep the codebase's existing derivation,
`floor(parentLimit / 3)`, where the parent limit is the current phase's `recursionLimit`.

The five research agents have the generic `web_search` and `file_search` capabilities turned
off. They use module-owned tools instead: `search_web`, `fetch_page`, `read_document`,
`search_uploads` and `read_feed_items`. Each of these writes a snapshot first and returns the
snapshot id with the content, which is what makes "agents never read a live page directly"
true in code rather than in prompt. `search_uploads` wraps the existing RAG query path
rather than the `file_search` tool.

### 5.3 Job lifecycle

```
submitted -> briefing -> researching -> drafting -> verifying -> delivered
                                                      |
                                   (budget exhausted) -> delivered (partial)
                                   (fatal error)      -> failed (with reason)
```

1. **Submit.** The user picks one of the five agents, describes the task, attaches files or
   names SharePoint and OneDrive paths, and sends. The chat route creates a `ResearchJob` row
   owned by the user. For jobs 1 and 5 the submit request then fetches and snapshots every
   named internal document while the user's token is live (section 5.9), reporting progress
   in the conversation, before the job is enqueued through the existing trigger queue
   (`packages/api/src/agents/triggers/`). The conversation shows a "queued" message once the
   job is enqueued.
2. **Brief.** The agent's first step writes a short brief: the question as understood, the
   sources it intends to use, the output shape, and any exclusions. The brief is saved on the
   job and streamed into the conversation so the user can read it while the job runs. Nothing
   in the brief is a claim and it needs no citation.
3. **Research.** The agent plans sub-questions and fans them out to subagents using the
   existing `subagents` capability. Each subagent receives the brief, one sub-question, a
   list of allowed source kinds and a step budget derived from the job budget. Subagents
   return findings as structured notes: claim text, snapshot id, locator within the snapshot.
   No prose.
4. **Draft.** The parent agent assembles the report from the notes. Every sentence that
   asserts a fact carries an inline citation marker that resolves to a snapshot id. The
   template per job type lives in the agent's instructions.
5. **Verify.** A separate, deterministic pass (not the model deciding it is done) opens every
   cited snapshot, locates the referenced passage, and asks a small verification model
   whether the claim is supported by that passage alone. Results per citation: supported,
   unsupported, or source unavailable. Unsupported claims are rewritten as "unverified" in
   the report with the original citation kept visible; claims whose source cannot be
   re-opened are flagged the same way. The pass also checks the report against the brief and
   adds a "scope notes" section when they diverge. The verification summary (counts per
   state) is written at the top of the report.
6. **Deliver.** The markdown report is saved as a file attached to the final message in the
   job's conversation, using the existing agent file delivery path
   (`packages/api/src/agents/files/`). Every snapshot it cites is marked archived. Each
   additional delivery channel (section 5.8) is enqueued as its own trigger delivery, so a
   failed email is retried on its own without re-running the job.

Budgets: each job type has a default wall-clock limit and step limit in config. A subagent's
budget is derived from the parent's remaining budget, never larger. When the wall-clock
budget reaches a configurable fraction (default 85 percent), the parent stops fanning out and
proceeds to draft and verify with what it has.

### 5.4 Sources and snapshots

Every source the agent reads becomes a `Snapshot` row before the agent sees its content.
Agents never read a live page directly. This is what makes "nothing from memory"
enforceable: a citation can only point at a snapshot id, and the verifier only reads
snapshots.

| Source kind | How fetched | Snapshot content | Stable reference |
|---|---|---|---|
| Web page | Brave Search for discovery, then the module's own fetch through the existing SSRF-guarded agent, converted to markdown | Full page markdown, final URL, fetch time, content hash | URL plus fetch time |
| RSS item | Feed poller, section 5.6 | Item markdown (full content when the feed carries it, otherwise fetched page), link, published time, feed id | Item link plus published time |
| SharePoint / OneDrive document | MCP gateway tool call under OBO during the submit request, before the job detaches | Document text as returned, item id, drive id, section anchors where the gateway provides them | Site, drive and item id plus section anchor |
| LibreChat upload | `search_uploads`, wrapping the existing RAG query path | The retrieved chunks plus file id and page or chunk locator | File id plus locator |
| Prior report (job 3) | Read from the user's own earlier `ResearchJob` outputs on the same topic | The report markdown | Job id |

Snapshots are owned by the user who caused the fetch. Two users fetching the same URL get
two snapshots. The exception is RSS items, which belong to the feed and are shared, since
the content is public and polled once.

Retention: snapshots older than 45 days are deleted by a nightly sweep unless `archived` is
true. `archived` is set the moment a delivered report cites the snapshot. The same 45-day
rule and archive flag apply to web and document snapshots, not only RSS items.

Storage: snapshot markdown goes through the existing file storage strategy
(`api/server/services/Files/strategies.js`) so it lands in whichever backend the deployment
already uses, with a small Mongo row holding metadata and the storage key. The builder
should expect snapshots to dominate storage growth and surface the sweep's numbers in logs.

### 5.5 Brave Search

Brave is not a provider in `SearchProviders` today (serper, searxng, tavily, keenable are),
and the provider implementations live in the separate `@librechat/agents` package, not in
this repository. The research module therefore carries its own small Brave Search client
behind a `SearchClient` interface, used only by the `search_web` tool, with its API key read
from `research.search.braveApiKey` (env placeholder allowed). The generic `webSearch` config
and the other agents are untouched. Promoting Brave to a first-class provider for every
agent is an upstream change to `@librechat/agents` and is out of scope.

Scraping does not use a third-party scraper: the research module fetches pages itself
through the existing SSRF-guarded agent, because it needs the markdown snapshot regardless.

### 5.6 Feeds and subscriptions

Models:

- `Feed`: url, title, last polled, last status, consecutive failures, catalogue flag,
  catalogue category. Shared across users. Unique on url.
- `FeedSubscription`: user, feed id, user label, source (opml or catalogue), created.
  Unique on user plus feed.
- `FeedItem`: feed id, guid, link, title, published, snapshot id, archived. Unique on feed
  plus guid.

The poller is a background worker started next to the schedule engine. It polls every feed
with at least one subscription on a configurable interval, honours ETag and Last-Modified,
backs off on failure, and disables a feed after a configurable number of consecutive
failures while leaving the subscriptions intact so re-enabling is a flag flip. Items are
written once per feed, so 4,000 subscribers to one feed cost one poll.

Catalogue: feeds with the catalogue flag appear in the client picker grouped by category.
Managing the catalogue is an admin action behind the existing admin role check.

OPML: import parses the file, creates missing `Feed` rows, and subscribes the user. Export
writes the user's subscriptions back out as OPML. Per-user feed cap is enforced on import.

Client: a Feeds panel in the side panel lists the user's subscriptions, offers OPML import
and export, the catalogue picker, and a per-feed unsubscribe. A read-only item history view
shows the last 45 days per feed, which is what "keep record" means in practice.

### 5.7 Scheduling

Jobs 2, 3 and 4 may be scheduled. The existing schedule engine
(`packages/api/src/schedules/`) already claims due schedules with leases, fires through the
trigger queue, mints a short-lived token for the owner and runs through the normal chat
route. The research module adds:

- A schedule for a research job is an ordinary `Schedule` row with the research agent as
  `agent_id` and the prompt or interest statement as its prompt. The `Schedule` model, its
  zod payload and the schedule dialog are not modified, because that subsystem syncs from
  upstream every two weeks. Research-specific settings (delivery channels, job type) live in
  a research-owned `ResearchSchedule` row keyed by schedule id, created and deleted alongside
  the schedule through the research routes.
- At fire time the job is created with `invocationMode: 'delegated'`, which restricts source
  kinds to web and RSS. Any attempt to call a SharePoint or OneDrive tool in delegated mode is
  refused by the source adapter, not left to the prompt.
- Job 3 (trends) loads the user's previous delivered reports for the same schedule as prior
  report snapshots before researching, and its template requires a "what changed" section.
- Job 4 (digest) selects feed items published since the schedule's last successful run,
  capped by a configurable maximum item count, and applies the stated interest. Its template
  requires a "left out" section listing items it dropped and one line on why, so the value
  of what was cut is visible.

Per-user schedule caps and minimum intervals come from the existing `interface.schedules`
settings. The research config adds nothing there.

### 5.8 Delivery

Every job delivers to its conversation. Scheduled jobs additionally honour the user's
delivery preferences, stored on the `ResearchSchedule` row. Each channel is a
`DeliveryChannel` implementation the module receives from the caller, and each send is its
own trigger delivery with the queue's existing retry and backoff:

- **Conversation**: always. The existing schedule engine already creates a new conversation
  per run.
- **Email**: the report markdown rendered to HTML and sent through the existing `sendEmail`
  utility (nodemailer or Mailgun) with a new `researchReport` handlebars template. Subject
  carries the job type and date. The body links to the conversation; the raw markdown is
  not attached, since `sendEmail` has no attachment support and the conversation holds it.
- **Teams**: a message to the user through Microsoft Graph via the MCP gateway. Posting as
  the user needs a user token in an unattended run, which does not exist until the gateway
  token provider in section 5.9 is built. Teams delivery is therefore phase 4 and ships only
  with that provider.

Delivery failures are recorded on the job per channel. A job whose report is saved but
whose email failed is "delivered with warnings", never "failed".

### 5.9 On-behalf-of and interactive jobs

Jobs 1 and 5 read SharePoint and OneDrive through the MCP gateway, which performs
on-behalf-of exchange from the user's OpenID access token. In this repository that token is
only available during a live request: `packages/api/src/mcp/openid.ts` substitutes
`{{LIBRECHAT_OPENID_ACCESS_TOKEN}}` from the request's session, trigger envelopes are
required to carry no credentials, and a detached job may run on another replica after the
request has ended. There is no supported way to hand a user token to a detached run today.

**Decision (Alex): fetch at submission.** The submit request for jobs 1 and 5 resolves every
named document path, calls the gateway tools under the live token, and writes a snapshot per
document, streaming progress into the conversation. Only then is the job enqueued. The
detached phases read those snapshots and the web; the `read_document` tool refuses any call
in a detached phase. Consequence, stated to the user in the agent's instructions and the
brief: the agent cannot discover additional internal documents mid-run. If the user wants
more documents considered, they submit a follow-up job naming them. Submission is bounded by
`research.submitFetch.maxDocuments` and `maxMinutes`.

**Documented future path: gateway token provider.** The schedule engine already defines a
`HostUpstreamTokenProviderResolver` hook (`packages/api/src/schedules/mcp.ts`) with
`{scheduleId, ownerId, agentId, invocationMode: 'delegated'}` that the default app does not
install. The step up is a host implementation of that hook against Deloitte's MCP gateway,
returning a user-scoped token for an unattended run. It needs the gateway to support a
refreshable delegated grant, a stored-grant model on the LibreChat side, and a security
review. When it lands, three things unlock without redesign: mid-run document discovery for
jobs 1 and 5, scheduling for jobs 1 and 5, and Teams delivery. The `read_document` refusal
and the Teams channel are both gated on the provider being installed, nothing else.

### 5.10 Configuration

A new `research` section on `configSchema` in `packages/data-provider/src/config.ts`,
loaded into `AppConfig` in `packages/data-schemas/src/app/service.ts`. All defaults
reproduce the behaviour described here and every value is an operator lever.

```yaml
research:
  enabled: true
  agents:
    provider: <gateway endpoint name>
    model: <gateway model id>
    author: <user id, defaults to the first admin>
  search:
    braveApiKey: ${BRAVE_API_KEY}
  submitFetch:
    maxDocuments: 25
    maxMinutes: 10
  jobs:
    requirements: { wallClockMinutes: 45, maxSteps: 400 }
    currentEvents: { wallClockMinutes: 30, maxSteps: 300 }
    trends:        { wallClockMinutes: 30, maxSteps: 300 }
    digest:        { wallClockMinutes: 15, maxSteps: 200, maxItems: 200 }
    solution:      { wallClockMinutes: 60, maxSteps: 500 }
  budgetDraftThreshold: 0.85
  maxConcurrentJobsPerUser: 2
  verification:
    model: <gateway model id>
    maxClaims: 400
  snapshots:
    retentionDays: 45
    sweepHour: 3
  feeds:
    pollIntervalMinutes: 30
    maxPerUser: 100
    disableAfterFailures: 10
  delivery:
    email: true
    teams: false
```

### 5.11 Data models

New collections in `packages/researcher/src/db`, each created through
`createXModel(mongoose)` with tenant isolation (`applyTenantIsolation` from
`@librechat/data-schemas`) and a `createXMethods` set, following the Banner and Schedule
examples:

- `ResearchJob`: user, agent id, job type, invocation mode, status, brief, budget, budget
  used, conversation id, report file id, cited snapshot ids, verification summary, delivery
  state per channel, schedule id when scheduled, timestamps.
- `Snapshot`: user (null for feed items), source kind, stable reference fields per kind,
  storage key, content hash, fetched at, archived.
- `ResearchSchedule`: schedule id, user, job type, delivery channels.
- `Feed`, `FeedSubscription`, `FeedItem` as in 5.6.

The agent definitions are ordinary `Agent` rows in a seeded "Research" `AgentCategory`.
Seeding rules: the five agents have fixed ids (`research-requirements`,
`research-current-events`, `research-trends`, `research-digest`, `research-solution`); the
seed step runs at boot alongside `ensureDefaultCategories`, creates any agent whose id is
missing with provider, model and author from `research.agents`, and grants the PUBLIC
principal view access so they list in the marketplace. An agent that already exists is never
overwritten, so admin edits in the builder win. The module's copy of the instructions is the
seed, not a runtime override. An operator who wants the shipped instructions back deletes the
agent row and restarts.

### 5.12 Client

Kept minimal for v1 and composed from existing primitives:

- The five agents appear under a Research category in the agent picker (the marketplace
  category tabs already exist; the deployment enables `interface.marketplace`).
- The job's conversation shows: a queued state, the brief as it streams, a progress line
  per subagent (the existing subagent thread panel), and the final report as an attached
  markdown file with the verification summary visible inline.
- A Research panel in the side panel lists the user's jobs with status, budget used and a
  link to each conversation, plus a cancel control for running jobs.
- The Feeds panel from 5.5.
- The schedule creation form gains a delivery channel selector when the chosen agent is a
  research agent.

All strings through `useLocalize()`, semantic theme roles, keyboard and ARIA intact.

## 6. Phasing

Alex's decision is that all five jobs ship. The order below is my call for how a builder
sequences the work so each phase is usable on its own.

1. **Core pipeline and interactive jobs.** Research module, job model, snapshot store,
   Brave provider, own fetch-to-markdown, citation verifier, file delivery, Research panel,
   the five agents seeded. Jobs 1, 2 and 5 usable interactively. Job 3 and 4 agents exist
   but run interactively only.
2. **Feeds.** Feed models, poller, catalogue, OPML import and export, Feeds panel, RSS as a
   source kind. Job 4 works interactively over the user's feeds.
3. **Scheduling and delivery.** Delegated mode, schedule integration for jobs 2, 3 and 4,
   prior-report loading for job 3, email delivery, delivery selector in the schedule form.
4. **Gateway token provider and what it unlocks.** Host implementation of
   `HostUpstreamTokenProviderResolver` against the MCP gateway, then Teams delivery,
   mid-run document discovery and scheduling for jobs 1 and 5. Depends on the gateway team
   and a security review, so it is planned but not promised for the first release.

## 7. Left to the builder

- Exact prompt wording and report templates for each job type.
- Choice of HTML-to-markdown conversion library for page snapshots.
- OPML parsing library.
- How section anchors are derived for SharePoint documents, given what the gateway returns.
- Internal layout of the Research and Feeds panels within the side panel conventions.
- Test strategy, following the repository's real-logic-over-mocks rule: real Mongo through
  `mongodb-memory-server`, real MCP SDK servers for the gateway stand-in, mocked HTTP only
  for Brave and page fetches.

## 8. Open questions and risks

- **Gateway delegated grant.** Can the MCP gateway issue a refreshable user-scoped grant for
  unattended runs? Phase 4 depends on it. Until then, document access ends at submission.
- **Teams send capability.** Does the MCP gateway expose a Graph call that can post a chat
  message to the signed-in user? Also phase 4.
- **Multi-replica poller and sweep.** The feed poller and the snapshot sweep need leasing if
  Deloitte runs more than one API replica. The schedule engine's lease pattern is the model;
  the builder should reuse it rather than assume a single process.
- **Email from LibreChat.** Is SMTP or Mailgun configured in Deloitte's environment, and is
  an email from the LibreChat sender acceptable to Deloitte's mail policy?
- **Verification model.** Which gateway model should perform citation checks? It needs to
  be cheap and fast, since a long report produces hundreds of checks.
- **Catalogue ownership.** Who at Deloitte curates the feed catalogue, and is the existing
  admin role the right gate?
- **Success measure.** Proposed, for Alex to strike or keep: jobs completing within budget
  above 95 percent, citations verified as supported above 90 percent per report, and weekly
  repeat use per active user.

## 9. Calls I made after the builder review

A reviewer read the draft as a builder and asked five questions. One went to Alex (the
on-behalf-of decision in 5.9). The other four I settled, and they are listed here so they
can be checked while reading:

- **Execution model** (5.2): the research module owns a persisted state machine and runs
  each phase as its own generation through the trigger queue, rather than one long agent
  turn. Chosen because only this shape can honour the wall-clock budget and the partial
  output guarantee.
- **Brave** (5.5): a module-private search client, not a new provider in
  `@librechat/agents`. Chosen to keep the change inside this repository.
- **Seeded agents** (5.11): fixed ids, seed-if-missing, admin edits win, provider and model
  from config. Chosen so a boot never clobbers an admin's tuning.
- **Schedule settings** (5.7): a research-owned `ResearchSchedule` side table instead of new
  fields on `Schedule`. Chosen to keep the upstream-synced schedule subsystem untouched.
