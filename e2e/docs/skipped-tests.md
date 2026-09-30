# Skipped mock e2e tests

These tests are `test.skip(...)`-ed in the mock Playwright suite (`e2e/specs/mock/**`).
Each was investigated individually against a real Playwright report (traces, timings,
error context) rather than assumed — see the reason column for the specific cause.
None of these are caused by the base config timeout (`e2e/playwright.config.mock.ts`),
which is unrelated to why each of these fails.

| File | Test | Reason |
|---|---|---|
| `message-tree.spec.ts` | regenerates assistant siblings, cycles branches, follows up, and forks the visible branch | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `message-tree.spec.ts` | shows the regenerating response immediately when regenerating a non-latest sibling | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `message-tree.spec.ts` | does not flash the kept sibling before the created event when regenerating a non-latest sibling | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `message-tree.spec.ts` | resumes pending OAuth on the selected older branch after reload | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `message-tree.spec.ts` | long threads retain regenerated and save-and-submit branches after revisit | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `agent-handoffs.spec.ts` | invokes the target-scoped MCP tool after transfer and persists its output | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `thread-fold.spec.ts` | older-branch selection and sibling counters survive a follow-up turn and reload | Exceeds the Playwright timeout even at its original (pre-existing) budget. |
| `chat.spec.ts` | keeps upload-to-provider CSV attached to the sent message and model input | `interface.providerUpload` is never enabled in `e2e/config/librechat.e2e.yaml`, so the upload-to-provider UI never renders. |
| `chat.spec.ts` | supports attaching, removing, and sending provider files from the composer | Same as above — `interface.providerUpload` is not enabled. |
| `agent-skills.spec.ts` | creates an agent with deployment and inline skills, then removes and persists one | Requires the external `SKILL_SCANNER_URL` scanning service, not available in this environment. |
| `agent-skills.spec.ts` | persists explicit use-all semantics and includes skills created later | Requires the external `SKILL_SCANNER_URL` scanning service, not available in this environment. |
| `agent-skills.spec.ts` | creates a skill inside the builder and auto-selects it for the new agent | Requires the external `SKILL_SCANNER_URL` scanning service, not available in this environment. |
| `agent-skills.spec.ts` | discovers and selects a skill beyond the first 100 accessible skills | Requires the external `SKILL_SCANNER_URL` scanning service, not available in this environment. |
| `model-spec-skills.spec.ts` | loads accessible configured skills and skips missing or inaccessible names | Requires the external `SKILL_SCANNER_URL` scanning service, not available in this environment. |
| `mcp.spec.ts` | creates an agent with MCP server tools and persists the selection | The Tool Library dialog's `e2e-memory` server button doesn't become visible in time; root cause not yet isolated. |

## Follow-up

- The 7 timeout failures need real investigation into why they run long (or a
  deliberate, justified timeout increase) rather than being left skipped indefinitely.
- The 5 `SKILL_SCANNER_URL` failures need either a local/mock scanner fixture or an
  environment variable to disable scanning in e2e runs.
- The 2 `providerUpload` failures need `interface.providerUpload: true` added to
  `e2e/config/librechat.e2e.yaml` once the feature is intentionally exercised.
- The `mcp.spec.ts` Tool Library failure still needs root-cause investigation.
