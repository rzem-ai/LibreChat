---
name: add-citations
description: Wire citations (inline chips, footnote source cards) into any backend service or tool in LibreChat — a new MCP source, an existing tool that lacks reliable citations, or an entirely new integration. Use whenever a feature needs "learn more" / footnote-style attribution added to its output.
---

# Add Citations

Generalized steps for getting citation chips working for any service in LibreChat's chat pipeline. Read `args` for the specific target before starting (e.g. "MCP server: Confluence KX search", "tool: web_search organic results", "new REST integration: internal wiki"). If no target is given, ask what service/tool needs citations and what its raw output looks like.

## Step 0: triage — which pattern applies?

Citations reach the UI through one of two mechanisms, and picking the wrong one wastes effort:

- **Backend-guaranteed**: the server deterministically inserts anchor characters into the assistant's text after the run, independent of what the model wrote. Chips always render if there's source data. `file_search`, MCP results, and `web_search`'s organic/news results all work this way (`insertFileCitations`, `insertMCPCitations`, `insertWebSearchCitations`, `appendGuaranteedMCPCitations` in `citations.ts`).
- **Model-generated**: the tool's system prompt instructs the model to emit the anchor escape sequences itself inline. Chips only render if the model actually complies, which is unreliable. `web_search`'s image/video results still work this way (`buildWebSearchContext` in `packages/api/src/tools/toolkits/web.ts`), because there's no per-result text to match those against.

Ask: **does the target service already return structured result data (a list of sources/passages/hits) that the backend can match against the assistant's text?** If yes → use Pattern A or B (backend-guaranteed, preferred). If the service is prompt-only with no structured data to match against (like `web_search`'s images/videos) → Pattern C's insertion step doesn't apply and you're stuck with model-generated — flag to the user that it will be unreliable.

| Situation | Pattern |
|---|---|
| New MCP tool/knowledge base, no citations yet | **A** — plug into the existing MCP dispatch chain |
| Existing tool/service returns structured data but citations are missing/unreliable | **B** — add backend-guaranteed insertion, mirroring `insertFileCitations`/`insertMCPCitations`/`insertWebSearchCitations` |
| Entirely new, non-MCP service/integration from scratch | **C** — build a producer + type + insertion + frontend wiring, following A/B's shape |

---

## Pattern A: New MCP source (existing, well-trodden path)

Pipeline: tool call finishes → `api/server/controllers/agents/callbacks.js` detects an MCP tool result → `buildMCPResultSources({toolName, serverName, content, args})` in `packages/api/src/mcp/feed/feed.ts` dispatches through a chain of per-integration builders (RSS/Atom → report → AFR → KX → entities → SharePoint → raw fallback) → `citations.ts` inserts anchors and appends disclaimers automatically → frontend renders generically.

1. **Inspect the raw output.** Find the shape of `content` passed into `buildMCPResultSources` (structured JSON, RSS/Atom, or free text).
2. **Write a builder.** Create `packages/api/src/mcp/<name>/<name>.ts` exporting `build<Name>Sources({ toolName, serverName, content, args? }): MCPSourcesResult | undefined`. Sniff on `toolName` prefix or `content` shape (see `SHAREPOINT_TOOL_PREFIX` in `feed.ts`); return `undefined` to fall through. Map hits to `MCPResultSource { toolName, serverName, content, title?, link?, usageRestriction?, date?, usageRestrictionLink? }` (defined in `packages/data-provider/src/schemas.ts` ~line 887).
3. **Register it** in the ordered dispatch list in `buildMCPResultSources` (`feed.ts`) — more specific sniffing before generic fallbacks.
4. **Add a link template if needed** in `packages/api/src/mcp/linkTemplates.ts`, called via `resolveMCPSourceLink`.
5. **Set disclaimer/usage-restriction fields** if required — `appendGuaranteedMCPCitations`/`appendMCPDisclaimers` in `citations.ts` pick these up automatically, no changes needed there.
6. **Write a real test** with actual sample payloads (not stubbed SDK calls), alongside the builder.
7. **Check `getMCPIcon()` in `Citation.tsx` for a per-tool-prefix icon convention.** Other MCP integrations each get a dedicated lucide icon there keyed off their tool-name prefix (e.g. `afr_` → `Newspaper`, `kx_` → `Users`) with a generic `Plug` fallback for anything unmapped. This is a small, easy-to-miss detail because it's purely cosmetic and nothing breaks without it — the generic fallback still renders a working chip — but it's the established convention every other MCP integration follows, so add an entry for your new prefix too for visual consistency. Don't skip this because of the chip-icon gotcha below — that gotcha is about a different mechanism (the non-MCP `chipIcon`/favicon fallback in `SourceHovercard.tsx`), not this one.
8. **Verify end-to-end**: chip renders inline (`Citation.tsx`), source card in footnote list (`Sources.tsx`), disclaimer text if applicable.

## Pattern B: Add backend-guaranteed insertion to an existing tool

Use this when a tool already returns structured result data (organic results, passages, hits) but currently relies on the model to self-cite, and citations are unreliable or missing. `web_search`'s organic/news results went through exactly this migration — read `insertWebSearchCitations` in `citations.ts` as a reference implementation before writing your own.

1. **Confirm the data is already there.** Find the existing result type already attached as `output.artifact[Tools.<yourTool>]` — you're not adding a new producer, just a new consumer of existing data. (`web_search` organic/news use `SearchResultData`, `packages/data-provider/src/types/web.ts:73-89`.)
2. **Write an `insert<Name>Citations` function** in `packages/api/src/agents/citations.ts`: build a `Passage[]` from your result data (keyword/passage overlap tokens, keyed by turn/fileIndex — see `buildPassages`/`buildMCPPassages`/`buildWebSearchPassages` for the shape), then call the shared `applyPassageAnchors(contentParts, passages, options)` helper to do the actual per-part scan-and-insert loop — don't write that loop yourself, it's already shared across `insertFileCitations`/`insertWebSearchCitations`/`insertMCPCitations`. `options` is where the matching profile (step 3) and anchor tag get set.
3. **Pick the right matching profile — the step most likely to silently under-cite.** Two profiles exist and picking the wrong one doesn't error, it just quietly starves most sentences of citations: `SIMILARITY_THRESHOLD` (strict, unstemmed `tokenize`) is for sources the model quotes closely and at length, like file_search chunks. `MCP_SIMILARITY_THRESHOLD` (looser, `tokenizeStemmed`) is for short, loosely-paraphrased article/snippet sources. Default to the MCP profile unless the source content is long-form and closely quoted. If it's genuinely unclear which profile fits, default to the MCP profile anyway — but say so explicitly to the user (e.g. "assuming short/paraphrased sources, using the MCP profile") instead of silently picking one, since picking wrong here produces no error, just quietly under-cited output. (`web_search` shipped with the strict profile at first — only near-verbatim title echoes crossed threshold, and every paraphrased body claim silently got no anchor — before being corrected to the MCP profile.)
4. **Add a guaranteed-append pass** if the source has must-cite content (disclaimers, restricted data) — mirror `appendGuaranteedMCPCitations`.
5. **Wire it into `applyEndOfTraceCitations`** alongside the existing insertion calls.
6. **Remove the now-redundant self-citation instructions from the tool's system prompt.** Once the backend inserts anchors for a result type, the model must not also be told to self-emit escape-sequence anchors for it — leaving both live risks duplicate or conflicting anchors between what the model writes and what the backend inserts. Find the prompt-building function that told the model to self-cite that type (e.g. `buildWebSearchContext` in `packages/api/src/tools/toolkits/web.ts`) and replace those instructions with a note that citations for that type are now automatic. Leave the self-citation instructions in place only for result types that remain genuinely model-generated per Step 0 (e.g. `web_search`'s images/videos).
7. **Check the frontend mapping is complete.** `refTypeMap` in `client/src/components/Web/Context.tsx:53-59` must have an entry for every `refType` the anchors use, and the mapped key must match the actual field name on the result data object — a mismatch here silently drops the chip with no error. Cross-check every `type` value the prompt/builder can emit against this map. (`web_search` originally missed this: `image` anchors weren't mapped to `images`, the plural field on `SearchResultData`, until it was added.)
8. **Check for turn-numbering collisions** in `client/src/hooks/Messages/useSearchResultsByTurn.ts`. Grep every `turnMap[...] = ` assignment in the file first — there is often more than one write-site (e.g. a `web_search` branch and a separate `file_search`/agent-mode dedup branch), and each one that's a plain assignment rather than a merge is an independent collision risk, not just the first one you find. MCP turns are offset (`fileSearchTotal + mcpTurn` in `citations.ts` ~line 774) specifically so they don't collide with other turn counters; a new numbering source must either reuse that offset scheme or merge into `turnMap` at every site instead of overwriting it. (`web_search` originally overwrote the shared `turnMap` entry in one such branch; it now merges — `turnMap[turnKey] = { ...turnMap[turnKey], ...agentSearchData }` — follow that shape at every assignment site, not a plain overwrite.) Fix every plain-overwrite site you find this way, even ones in another tool's branch that predate your change — once your new anchors flow through the same shared `turnMap`, a pre-existing collision there becomes newly load-bearing, and "that bug isn't mine" is not a reason to ship it unfixed.
9. **Test with real sample text + result data**, not mocks, asserting the returned text contains the expected anchors and no pre-existing anchors were duplicated or corrupted. Include at least one paraphrase/inflection test (a different word form than the source uses, e.g. "reports" vs "reported") — a test suite that only checks exact-substring matches will pass even with the wrong profile from step 3 and hide the under-citing bug. Also read the fenced-code-block and URL/number-splitting gotchas documented inline in `citations.ts` before touching this file.

## Pattern C: Entirely new, non-MCP service from scratch

Only needed if the service isn't MCP-based and has no existing structured result type. Combine both above patterns from zero:

1. Define the raw data producer (wherever the tool/service result is fetched) and attach it as an `artifact` on the tool-call output, same convention as `Tools.web_search`/`Tools.file_search`/`Tools.mcp_results`.
2. Define a typed shape for it in `packages/data-provider/src/types/` (or `schemas.ts` for MCP-style), reusing `Reference`/`ResultReference`/`MCPResultSource` fields where they already fit — don't invent a parallel shape for the same concepts (title/link/snippet/attribution).
3. Follow Pattern B steps 2-9 for backend insertion (preferred over model-generated-only, for reliability).
4. Add the new `refType` to `SearchRefType` (`packages/data-provider/src/types/web.ts:5`) and to `refTypeMap` in `Context.tsx` — verify the mapped key matches the real field name on your new data type.
5. Verify end-to-end in the actual chat UI, not just unit tests — chip rendering depends on the full regex → remark plugin → Context lookup → Citation component chain, and a break anywhere in that chain fails silently (renders `null`, no error).

---

## Final step (all patterns): report what you verified, not what you wrote

Every failure mode in this skill is silent — a broken chain renders nothing and throws no error (see gotchas below). So finishing the code is not the same as finishing the task. Before telling the user it's done, explicitly state which of these you actually confirmed, not just implemented:

- Chip renders inline in the assistant's message (`Citation.tsx`)
- Source card appears in the footnote list (`Sources.tsx`)
- Disclaimer/usage-restriction text appears, if applicable
- (Pattern B/C) `refTypeMap` has an entry whose key matches the real field name on the result data

If you couldn't drive the actual UI to check one of these, say so plainly instead of reporting the task as complete — "wired up, unverified in UI" is a valid and honest status.

---

## Cross-cutting gotchas (apply to B and C especially)

- **Silent failure is the default failure mode.** A wrong `refTypeMap` key, a turn-number collision, or an unmatched regex all just render nothing — no error, no log. Always verify a new citation type in the actual UI, not just by reading the code.
- **`citations.ts` insertion logic has real footguns**: fenced code blocks, URL/number splitting, duplicate-anchor avoidance are all called out in inline comments — read them before adding a new `insert<Name>Citations` function.
- **Matching-profile mismatch is a silent under-citing bug, not an error.** Strict/unstemmed matching (file_search's profile) only fires on near-verbatim text; short paraphrased sources (MCP articles, web_search organic/news) need the looser, stemmed profile or most claims get no anchor at all. See Pattern B step 3.
- **Backend-guaranteed beats model-generated.** If a pattern gives you the choice, prefer inserting anchors deterministically server-side over trusting the model to emit escape sequences. `web_search` is a live example of both coexisting: organic/news results are backend-guaranteed (reliable), while image/video results are still model-generated (flaky) because there's no per-result text to match those against yet.
- **Chip icons already have a generic fallback — don't build a new one.** `SourceHovercard.tsx`'s non-file/non-MCP chip renders `chipIcon ?? <FaviconImage domain={domain} />` (Google favicon lookup off `source.link`'s domain), the same mechanism the web_search in-progress panel already uses. Any new `refType` that isn't file/MCP gets this automatically — only pass a custom `chipIcon` from `Citation.tsx` if the source needs something other than a favicon (e.g. an admin-configured MCP server logo). This is a separate mechanism from `getMCPIcon()`'s per-tool-prefix icon mapping (Pattern A step 7) — don't let this gotcha talk you out of adding an entry there for a new MCP integration.

## Note on this codebase

The MCP citation builders (`kx.ts`, `afr.ts`, `entities.ts`, `sharepoint.ts`, `report.ts`) are fork-specific additions layered on top of upstream LibreChat's `file_search`/`web_search` citation support — expect comments tagged `Deloitte Custom Change`. Follow the existing builder/insertion patterns rather than introducing a different mechanism.