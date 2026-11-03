# Dataset Importer — Reference Tables

Read this file when processing **Format A** (traced sessions) or when selecting
metrics and deriving leading questions for any format.

---

## Metric Selection Table

**Base metrics (always apply):**
- `task_completion` (threshold: match existing cases, typically 0.5)
- `hallucination` (threshold: match existing cases, typically 0.5) — when source material is present

**Content-driven metrics — apply when pattern is detected:**

| Pattern detected | Metric | Threshold |
|---|---|---|
| First turn has inline source material (transcript/document) | `faithfulness` | 0.7 |
| Expected response contains a structured summary | `summarization` | 0.5 |
| Case has 3+ user turns (multi-step workflow) | `conversation_completeness` | 0.5 |
| Expected response has structured format (headings, lists, code blocks) | `instruction_adherence` | 0.5 |
| A turn asks a follow-up answered from source material | `contextual_recall` | 0.5 |
| Expected response is a formatted message (email/teams/post) | `instruction_adherence`, `answer_relevancy` | 0.5 |
| Session involves sensitive topics (HR, legal, finance, personal data) | `bias` | 0.5 |

**Skill workflow mapping** (when a SKILL.md injection is present in the trace):
- Summarisation step → `summarization`, `faithfulness`
- Q&A/insight step → `contextual_recall`, `faithfulness`
- Formatting/sharing step → `instruction_adherence`, `answer_relevancy`

---

## Leading Question Derivation Table

For each expected assistant response paired with a user turn, generate a
`leading_question` turn_assertion using this mapping:

| Content in expected response | Question template |
|---|---|
| Asks user to choose between options | "Does the response ask the user to choose between [Option A] and [Option B]?" |
| Contains named sections/headers | "Does the output contain distinct sections for [X], [Y], and [Z]?" |
| Mentions specific people by name | "Does the output mention [Name1], [Name2], and [Name3]?" |
| Lists N numbered items | "Does the output list at least [N] [items]?" |
| Contains specific figures/numbers from source | "Does the output reference [specific figure] from the source material?" |
| Formatted for a channel (email/teams/post) | "Is the message formatted appropriately for [format] without markdown syntax?" |
| Offers to continue/asks follow-up | "Does the response prompt the user to continue or offer a next step?" |

**Case-level leading questions** — generate 1-2 from the **final** assistant
response focusing on overall quality/completeness with specific content refs.

**Threshold assignment:**
- Turn-level probes: match existing cases (typically `0.5`)
- Case-level probes: match existing cases (typically `0.5`)
- Probes from UAT failure feedback: `0.8`

**Rules:**
- At least 1 gating question per turn
- Questions MUST be yes/no answerable by an LLM judge
- Reference specific content (names, numbers, section headers) — never generic
- If UAT failure metadata exists → add a gating probe targeting that failure

---

## Format A Filtering Rules

For Format A items, `expected_output.messages` is the **single source of truth**
(it contains everything in `input` plus the final assistant response). Use it
for all extraction: turns, assertion derivation, tool_calls, and source material.

To extract real user turns from `expected_output.messages`:

| Message pattern | Action |
|------|--------|
| `role: "user"` with actual user content | **INCLUDE** as a turn |
| `role: "user"` starting with `---\nname:` or `---\r\nname:` | **EXCLUDE** — injected skill instruction |
| `role: "assistant"` with `tool_calls` present | **EXCLUDE** — internal agent action |
| `role: "assistant"` without `tool_calls` | **Use for assertion derivation** |
| `role: "skill"` | **EXCLUDE** — tool result message |

**Content extraction:** The `content` field may be a plain string or an array
of blocks (`[{"type": "text", "text": "..."}]`). Always extract text regardless.

**Source material extraction:** The first real user message often contains both
instruction + inline document. Split at the boundary (short instruction sentence
followed by raw content). Save only the document portion as a source file.
