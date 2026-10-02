# Merge Summary: Upstream LibreChat v0.8.8 → `sync/public-LibreChat-v0.8.8`

Merge of `danny-avila/LibreChat` tag `v0.8.8` into this fork. 227 files had merge conflicts across 17 feature-oriented batches; all were resolved manually (or via sub-agent, with review) following the project rule: non-CSV-tracked files accept upstream as-is, CSV-tracked (Deloitte-customized) files are resolved to keep both the Deloitte feature and the upstream change working together, and every resulting diff against upstream carries a `// Deloitte Custom Change: ...` comment.

Full list of Deloitte customizations: `deloitte/DeloitteCustomChanges.csv`.

---

## Batch 1 — Infra / config (35 files)

Root/tooling config: `.github/workflows/*`, `.husky/pre-commit`, `.gitignore`, `package.json`/lockfiles, `client/jest.config.cjs`, `client/tailwind.config.cjs`, `api`/`packages/api`/`packages/data-provider` `package.json`, `otel/langfuse-fanout/go.mod`.

- Pre-commit hook: adopted upstream's version (lint-staged + `scripts/static-checks.mts --skip eslint,prettier,imports`), per explicit decision — no Deloitte-specific pre-commit logic survives.
- Dependency bumps mostly accepted from upstream as-is.
- **Needs follow-up (unresolved):**
  - `package-lock.json` and `bun.lock` were hand-merged (conflict markers resolved manually), not regenerated via installer. Recommend running `npm install` / `bun install` to confirm the resolved tree installs cleanly.
  - Version-pin discrepancies to double-check: `fast-uri@3.1.7` (upstream wants `3.1.8`), a `brace-expansion` override bumped to `^5.0.10`, and a pre-release pseudo-version pin for `golang.org/x/crypto` in the OTel Go module (this was a Checkmarx-driven security patch — confirm it's still needed/compatible).

## Batch 2 — Core shared types (17 files)

`packages/data-provider` types/schemas/request helpers, `packages/data-schemas` app interfaces, `packages/api` index/http types, `loadCustomConfig.js`.

- Foundational types merged cleanly; this unblocked batches 6/7/8/11 which depend on shared type shapes. No feature regressions — this is the type-level plumbing other batches build on.

## Batch 3 — Telemetry / Langfuse / OTel

Clean, mechanical merge of upstream's telemetry/observability plumbing. No Deloitte-specific behavior in this area; no follow-ups.

## Batch 4 — Shared UI components (`packages/client`) + misc client-wide files (10 files)

`CheckboxButton`, `DropdownPopup`, `SplitText`, `Tag`, `SendIcon`, `createTailwindColors.js`, `TermsAndConditionsModal.tsx`, `client/src/style.css`, `client/src/locales/en/translation.json`.

- Deloitte's GEL (design system) tokens preserved alongside upstream's new components/markup.
- **Needs visual review (not a functional break):** an oklch → RGB-triplet color storage migration landed from upstream; Deloitte's `border-medium-alt` companion variable deviates slightly from the new convention. Also worth a quick look: GEL font/corner-radius values after the merge. Nothing is broken, just worth an eyeball pass before shipping.

## Batch 5 — e2e mock test conflicts

Playwright mock-scenario conflicts resolved mechanically — no feature impact, test-infrastructure only.

## Batch 6 — MCP feature (32 files)

`OboTokenService.js`, `MCP.js`/`MCP.spec.js`, `controllers/mcp.js`, all of `client/src/components/MCP/*`, `MCPBuilder`, `packages/api/src/mcp/*`.

- **Security-relevant, personally verified:** the Checkmarx-driven XSS fix in `controllers/mcp.js` is intact — `handleMCPError` still maps errors through the `MCP_ERROR_GENERIC_MESSAGES` lookup rather than reflecting `error.message` into the HTTP response.
- Deloitte's OBO (on-behalf-of) token flow for MCP servers is preserved and wired through upstream's new MCP catalog/initialization code.
- Found and fixed a real bug introduced by the merge: illegal U+2028/U+2029 line-separator bytes had landed inside a regex literal in `parsers.ts`.
- **Needs visual review:** `MCPServerCard.tsx`'s Connect button now goes through upstream's `handleInitialize` flow instead of Deloitte's `connectOrConfigureServer`. This is an intentional architecture adoption (upstream's `loadMCPServerCatalogs` replaces Deloitte's `reinitMCPServerDeduped`/backoff mechanism), but the resulting UX should get a human click-through before shipping.
- **Known test debt:** `api/server/controllers/__tests__/mcp.tools.spec.js` merged with no conflict markers but is now testing a mechanism that no longer exists (8/26 tests fail). Equivalent coverage already exists in `packages/api/src/mcp/catalog/recovery.spec.ts` (71 passing cases). This file should be deleted or rewritten against the new architecture — left as a decision for the team rather than made unilaterally.

## Batch 7 — Skills feature (17 conflicted files + 4 follow-on test fixes)

`api/server/routes/skills.js`, all of `client/src/components/Skills/*`, `packages/api/src/skills/*`, `packages/data-schemas/src/methods/skill.ts`.

- Deloitte's Skills feature (Public/Shared/Mine grouping, PR #553) is preserved and now sits on top of upstream's new `TSkillSummary` type and skill-list props contract.
- Wired Deloitte's pre-existing OBO skill-scanner token service (`SkillScannerTokenService`, PR #616) into upstream's `createSkillsHandlers`, which now requires a scanner-token resolver as a mandatory dependency — without this, skill uploads would have silently stopped being scanned.
- Fixed two stale test fixtures: Deloitte's `renameSpacedFilePaths` feature (auto-renames spaced filenames in zip uploads instead of rejecting them) made old fixtures that used a space character as a "guaranteed-invalid path" no longer trigger the rejection they were meant to test; switched those fixtures to use `?` instead, which preserves the original test intent.
- **Needs a product decision:** `SkillsSidePanel.spec.tsx` tests an upstream-only "single My Skills toggle" design that Deloitte's Public/Shared/Mine grouping has already superseded. Only an incidental crash was fixed (missing `useAuthContext` mock) — the core assertions are stale and need someone to pick the intended group/pagination contract before they can be rewritten.
- **Needs a design decision:** `packages/api/src/skills/__tests__/import.test.ts` has 5 failing tests from one root cause — `persistPreflightedArchiveFiles`'s decompression-budget accounting isn't unified across the SKILL.md-manifest read pass and the rename/rewrite pass when PII/content filters are active (3 budget-counting bugs). The other 2 failures are because `SkillManifestConflictError` currently returns HTTP 400 where the test expects 422 (invalid-path) — needs a decision on whether to reclassify that error.

## Batch 8 — Agents / Tools (22 files)

`controllers/agents/{callbacks,client,openai}.js`, `packages/api/src/agents/*`, `packages/api/src/tools/*`, `AgentConfig.tsx`, `ModelPanel.tsx`, etc.

- **Security/architecture-sensitive, personally verified:** the HITL (human-in-the-loop) tool-approval flow in `client.js` correctly layers Deloitte's `attachApprovalToolClasses` (MCP gateway tool-class metadata) on top of upstream's new `markNativeCodeToolApprovalRequests` processing, before `buildPendingAction` runs. Both features are intact and correctly ordered.
- No open follow-ups from this batch.

## Batch 9 — Files / Upload (13 files)

`fileSearch.js`, `routes/files/{avatar,files}.js`, `services/Files/Azure/crud.js`, `AttachFileMenu.tsx`, `useFileHandling.ts`.

- **Flagged for a human double-check:** `Azure/crud.js`'s URL parsing was merged using a `new URL(fileURL, 'http://localhost')` base trick so the same code path handles both Deloitte's relative avatar paths and full Azure blob URLs. Logic looks correct but is subtle enough to warrant a second pair of eyes.
- Also cleaned up during final validation: a dead import (`isPermissiveMimeConfig`) left over in `client/src/utils/files.ts` from an already-correct resolution (the old permissive-config check had been replaced by the cleaner `isExplicitMimeConfig` check, but the now-unused import wasn't removed).

## Batch 10 — Auth (9 files)

`components/Auth/*`, `api/strategies/openidStrategy.js`, `packages/api/src/auth/domain.ts`.

- Nearly all conflicts were cosmetic (GEL design-system color tokens vs. upstream markup changes).
- `openidStrategy.js`: both sides had added different new imports (Deloitte's `invalidateCachedAuthUserDoc`, upstream's `DEFAULT_OAUTH_TOKEN_TTL_SECONDS`) — both were kept, no functional conflict.

## Batch 11 — User / Permissions (7 files)

`PermissionsController.js`, `UserController.js`, `routes/accessPermissions.js`, `data-schemas` user methods/schema, `PeoplePickerAdminSettings.tsx`.

- **Security-sensitive, personally verified:** Deloitte's People-Picker domain-allowlist filter (`isAllowedDomain`) is correctly injected as a dependency of `createPrincipalSearch`'s search functions, so filtering happens *before* scoring/sorting/slicing — not after, which would have leaked out-of-domain principals into paginated results first.

## Batch 12 — Chat UI misc (26 files)

Broad sweep of `client/src/components/Chat/*`, `Messages/*`, `Web/*` — headers, footers, message rendering, citations, attachments. All mechanical GEL-vs-upstream-markup resolutions; no behavioral conflicts, no open follow-ups.

## Batch 13 — Conversations / Nav / Sidebar (13 files)

`Conversations.tsx`, `ConvoOptions.tsx`, `UnifiedSidebar/*`, `routes/Root.tsx`, `Nav/Settings/*`, `Nav/Favorites/*`.

- **Architectural decision, personally verified:** upstream introduced new nested `ActivePanelProvider` instances inside `UnifiedSidebar.tsx`. These were removed in favor of keeping Deloitte's single top-level instance in `Root.tsx`, which `LearningTourProvider` depends on. Explanatory comments were left at both removal sites.

## Batch 14 — Prompts / Endpoints / Builder / Parameters (10 files)

`Prompts/display/PromptVersions.tsx`, `Endpoints/SaveAsPresetDialog.tsx`, `SidePanel/Builder/*`, `SidePanel/Parameters/Panel.tsx`, `packages/api/src/endpoints/*`. Mechanical resolutions, no behavioral conflicts.

## Batch 15 — Remaining backend/client misc (7 files)

`BaseClient.js`, `server/index.js`, `data-provider/{mutations,queries}.ts`, speech-settings and search-results hooks. Mechanical resolutions, no behavioral conflicts.

## Batch 16 — CSV documentation gap-fill

Added 8 rows to `deloitte/DeloitteCustomChanges.csv` that were missing: `.github/CODEOWNERS`, 5 `.disabled` deploy/gitnexus workflow files, a mislabeled `langfuse` entry corrected from `.js` to `.ts`, and `packages/api/src/telemetry/config.ts`. Per your explicit go-ahead to add these manually rather than leave the CSV incomplete.

---

## Final validation status

- Repo-wide conflict-marker sweep: **clean** (`git grep` for `<<<<<<<`/`=======`/`>>>>>>>` across all tracked files returns no matches).
- `npm run build:data-provider`, `build:data-schemas`, `build:api`: **all clean**, no type errors.
- Full `npm run build` (all 5 Turborepo workspaces, including frontend): **clean**.
- One stale pre-existing test fixed during validation: `packages/data-provider/specs/utils.spec.ts` asserted the *old* single-variable-only behavior of `extractEnvVariable`, which Deloitte's multi-placeholder resolution feature had already superseded before this merge began (the test was identical — and already stale — on both sides of the merge, so this isn't a merge regression). Updated the assertion to match the documented, intended behavior.
- Per-workspace Jest suites: test runs were interrupted by resource contention (running 5 workspaces' suites concurrently starved MongoMemoryServer instances of CPU/ports) and then stopped at your request before a clean serial pass completed. **Outstanding before this can be called fully green:**
  - `api` workspace: 17 suites failing, concentrated in `server/services/MCP.spec.js` (tests expecting specific `logger.warn`/`logger.debug` call messages around codeFile artifact handling — message text likely drifted during the merge) and some MongoMemoryServer timeouts likely attributable to resource contention rather than real bugs.
  - `packages/api`: one real assertion failure worth a look — `src/agents/fading.spec.ts` expects `fadingTier.v` to be `2`, got `1`.
  - `client`: suite was still running when tests were stopped; not yet assessed.
  - `packages/data-schemas`: `favorite.spec.ts` MongoMemoryServer timeouts, consistent with resource contention seen elsewhere.
  - Recommend re-running these one workspace at a time (not concurrently) to get a clean signal, per your earlier instruction to revisit this later.

## Known follow-ups requiring your decision (not fixed, by design)

1. Delete or rewrite `api/server/controllers/__tests__/mcp.tools.spec.js` (Batch 6) — tests a retired mechanism.
2. `SkillsSidePanel.spec.tsx` (Batch 7) needs a product decision on which skill group/pagination contract to assert against the new Public/Shared/Mine design.
3. `persistPreflightedArchiveFiles` decompression-budget accounting (Batch 7) and whether `SkillManifestConflictError` should be `422` instead of `400`.
4. Lockfile regeneration and version-pin double-check (Batch 1): `package-lock.json`/`bun.lock`, `fast-uri@3.1.7`, `brace-expansion@^5.0.10` override, `golang.org/x/crypto` pre-release pin.
5. Visual review of the GEL color-token migration (Batch 4) and the MCP Connect-button flow change (Batch 6).
6. `server/services/MCP.spec.js` and `src/agents/fading.spec.ts` test failures surfaced during this validation pass (see above) — not yet root-caused.
