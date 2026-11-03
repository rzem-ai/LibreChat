# Plan: verification scores in Langfuse, verifier spend in LibreChat usage

## Context

The citation verifier makes up to `verification.maxClaims` (400) claim checks plus one scope
check per job through `createResearchModelInvoker`
(`packages/researcher/src/server/model.ts:76`). That call passes only `{ signal }`, so:

- **Langfuse can't see it.** Every other model call in a job runs as an agent generation and
  is traced, but the verification outcome (how many citations held up) exists only on the job
  row. Design section 8 proposes "citations verified as supported above 90 percent per
  report" as a pilot success measure, and nothing reports it anywhere you can chart.
- **Its tokens are never billed.** Nothing in `packages/researcher` records usage, so
  verifier spend bypasses `transactions` and balances. `docs/research-agent-todo.md` lists
  "Verification model at scale: cost unmeasured" and "who pays for it?" as open.

Nothing in the docs or commit `64ea65a124` says either gap is deliberate. Per-claim Langfuse
tracing isn't reachable from the host today, because `@librechat/agents` keeps
`createLangfuseHandler` and friends private (they're undefined at runtime and off the root
barrel). Alex chose **scores only**: post the verification outcome as Langfuse scores on the
trace that wrote the draft, and record verifier spend in this same change.

A side effect worth keeping: no claim text, passage or scope note goes to Langfuse.
Passages can be SharePoint/OneDrive excerpts read under on-behalf-of (design 5.9).

## Approach

### 1. Generalise the Langfuse score sender (`packages/api/src/langfuse/feedback.ts`)

`sendFeedbackScore` hard-codes `name: 'user-feedback'`, `dataType: 'BOOLEAN'` and thumbs
mapping. Extract the shared part into an exported `sendTraceScores`:

```ts
export type TraceScore = {
  id: string;                 // deterministic, so a retried send upserts rather than duplicates
  name: string;
  value: number;
  dataType: 'NUMERIC' | 'BOOLEAN';
  comment?: string;
};
export async function sendTraceScores(params: {
  traceId: string;
  scores: TraceScore[];
  metadata?: LangfuseFeedbackMetadata;
  appConfig?: AppConfig;
  sampled?: boolean;
  destinationIds?: string[];
  centralTraceExportEnabled?: boolean;
  isTemporary?: boolean | null;
}): Promise<void>;
```

It keeps the existing gates and plumbing: `isLangfuseTraceAllowed`, `getScoreDestinations`,
`createScore`, `redirectPolicyFor`, `ENVIRONMENT`. `sendFeedbackScore` becomes a thin
caller that maps feedback onto one `TraceScore`, with its payload byte-for-byte unchanged (the
existing `feedback.spec.ts` guards this). `deleteScore` stays feedback-only.

### 2. Collect usage in the invoker (`packages/researcher/src/server/model.ts`)

- `createResearchModelInvoker` takes an `onUsage(usage: UsageMetadata)` sink. On each call
  it creates a `createMetadataAggregator()` (public in `@librechat/agents`, already used by
  `packages/api/src/agents/reasoningLabels/host.ts:274`) and passes
  `callbacks: [{ handleLLMEnd }]` alongside `signal`.
- Normalise the collected metadata to `{ input_tokens, output_tokens }`, the same field
  fallbacks the title path uses (`api/server/controllers/agents/client.js:6309`). Look for an
  existing normaliser in `packages/api/src/agents/usage.ts` before adding a local one.
- Also return the endpoint's `endpointTokenConfig` from `getOptions` (when it gives one), so
  custom-endpoint pricing is right.

### 3. Per-job verifier lifecycle (`host.ts`, `verify.ts`, `service.ts`)

- The `verifier` factory goes from `(owner)` to `(owner, job)`. The host builds a per-job
  usage array, hands it to the invoker as `onUsage`, and returns a `ClaimVerifier` with a new
  optional `finish(): Promise<void>` (added to the interface in `verify.ts`).
- `finish` records the whole pass in one call: `recordCollectedUsage(spend, { user, conversationId: job.conversationId, messageId: <report message id>, model, context: 'verification', collectedUsage, balance: getBalanceConfig(appConfig), transactions: getTransactionsConfig(appConfig), endpointTokenConfig })`.
  The report message id is `stableUuid(`${job.id}:report-message`)`. Lift it out of
  `delivery.ts:69` into a shared helper so both use one derivation.
- In `service.ts` `verifyAndDeliver`, call `await verifier.finish?.()` in a `finally`
  around `verifyDraft`. Tokens spent before a mid-pass failure still get billed. A failed
  `finish` is logged and never blocks delivery.

### 4. Post scores after delivery (`service.ts`, `host.ts`)

- New optional service dep `reportVerification({ job, summary })`, called only after
  `transitionResearchJob(..., 'delivered')` succeeds, fire-and-forget with `.catch(log.warn)`.
- The host implements it. Trace id is `traceIdForMessage(job.parentMessageId)` (from
  `packages/api/src/langfuse/trace.ts`), which is the drafting phase's response message, set
  at `phases.ts:124`. Skip it when `parentMessageId` is missing.
- Scores, with ids hashed from `${job.id}:${name}`:
  - `research.citations.supported_ratio`: NUMERIC, supported / total, omitted when total is 0
  - `research.citations.supported`, `.unsupported`, `.unavailable`, `.uncited`: NUMERIC
  - `research.scope.in_scope`: BOOLEAN, `!summary.scopeNotes` (sent only when the job has a brief)
  - `research.report.partial`: BOOLEAN
  - metadata: `jobId`, `jobType`, `verificationModel`. No comment and no scope-note text.

### 5. Wiring (`api/server/services/Research/index.js`, `ResearchHostDeps`)

Add two deps, both optional so tests and deployments without them keep today's behaviour:
- `spend: { spendTokens: db.spendTokens, spendStructuredTokens: db.spendStructuredTokens }`
- `sendTraceScores` from `@librechat/api`

That makes `/api` require-and-pass only. `recordCollectedUsage`, `getBalanceConfig` and the
score mapping live in the package.

### Config

No new `librechat.yaml` field. Scores follow the existing Langfuse switches
(`LANGFUSE_TRACING_ENABLED`, `langfuse.trace` policy, tenant destinations), and spend follows
the existing `balance` and `transactions` config. **Behaviour change to call out:** with
balance enabled, users are now charged for verification. That goes in the PR description
and in `docs/howto/administration.md`.

## Sequencing

The package move (`docs/research-package-plan.md`) has landed on `feat/research-agent`
(head `24a43d2fb9`) and the tree has no tracked changes, so this can start whenever it's
picked up. The paths above were re-checked against that head. Land it as its own commit on
top: score sender first (`packages/api`), then the researcher changes, since the researcher
imports the new `TraceScore` type.

## Files

- `packages/api/src/langfuse/feedback.ts` (+ `feedback.spec.ts`)
- `packages/researcher/src/server/{model,host,service,verify,delivery}.ts` (+ specs under `packages/researcher/test/server/`)
- `api/server/services/Research/index.js` (two dep lines)
- `docs/research-agent-todo.md` (update the two open items), `docs/howto/administration.md` (score names, billing note)

## Verification

- `packages/api`: `feedback.spec.ts`, with the existing feedback payloads unchanged. New
  cases: numeric `sendTraceScores` payload, policy-blocked no-op, deterministic ids.
- `packages/researcher`:
  - the invoker passes `handleLLMEnd` and reports usage to `onUsage`
  - `finish` runs once even when `verifyDraft` throws
  - `reportVerification` runs only after a successful delivered transition, and its failure
    doesn't fail delivery
  - the score mapping contains no claim, passage or scope-note text
  - `recordCollectedUsage` gets context `'verification'` and the report message id
  - use the real Mongo harness for the transaction write if `host.spec.ts` has one
- `npx tsc --noEmit` in `packages/api` and `packages/researcher`. Run `npm run sort-imports --`
  on the touched files, then `npm run build:packages`.
- Live, in the dev stack with `SCHEDULES_SINGLE_PROCESS`, Langfuse keys pointing at a project,
  and `balance.enabled: true`: run one research job to delivery, then check that
  - `transactions` has `context: 'verification'` rows for the job owner and the balance dropped
  - the drafting turn's trace in Langfuse shows the `research.*` scores
  - a second verification attempt of the same job doesn't duplicate scores
- `npm run static-checks -- --against origin/dev` before the PR.
