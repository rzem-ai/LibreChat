# Skill Scanner — Changes in `354dc5769` ("linking scanner to librechat")

Wires a new **skill security scanner** into every entry point that introduces
skill content, so nothing gets saved without being screened by Deloitte's AI
Registry scanning service first.

---

## `packages/api/src/skills/scanner.ts` (new, 440 lines)

The core of the change — the client for the external scanner. Everything else
just calls into it.

- Builds a `.skill` zip (a `SKILL.md` manifest) from whatever content is being
  introduced, POSTs it to `SKILL_SCANNER_URL`, and interprets two things from
  the response:
  - `validation` — is the manifest well-formed
  - `scan` — is the content safe (security findings with severity)
- Exposes five entry points, one per place skill content can originate:
  - `scanSkillOnCreate`
  - `scanSkillOnUpdate`
  - `scanSkillUpload` (zip/`.skill` import)
  - `scanSkillMarkdown` (bare `.md` import)
  - `scanSkillFileUpload` (adding a file to an existing skill)
- **Fails open** when `SKILL_SCANNER_URL` is unset — self-hosted/local setups
  without a scanner configured keep working unchanged.
- **Fails closed** on scanner errors/timeouts — if the scanner can't be
  reached or times out, that's treated as a hard block (`SkillScanError`,
  HTTP 422), since the code can't prove the content is safe.
- Findings are gated by `SKILL_SCANNER_MIN_SEVERITY` (default `low`) —
  informational findings (e.g. missing license) get surfaced but don't block.

## `packages/api/src/skills/handlers.ts`

Calls `scanSkillOnCreate` / `scanSkillOnUpdate` before a skill is persisted
via the "write instructions" form (create and PATCH/edit flows). A caught
`SkillScanError` short-circuits with a 422 and the structured `issues` list
instead of writing to the DB.

## `packages/api/src/skills/import.ts`

Same idea for the "upload a file" flow: `.md` uploads go through
`scanSkillMarkdown`, `.zip`/`.skill` uploads go through `scanSkillUpload`,
both before `handleMarkdown` / `handleZip` actually parse and persist
anything.

## `api/server/routes/skills.js`

Covers the one remaining path: adding a file to an *already-existing* skill
(`uploadFileHandler`). Calls `scanSkillFileUpload` (no manifest to validate
here, so it's security-findings-only) before the file is written to storage,
and maps `SkillScanError` to the same 422 shape as the other two paths.

## `packages/api/src/skills/index.ts`

One-line addition, `export * from './scanner'`, so the new module's exports
are reachable from `@librechat/api` — that's what `api/server/routes/skills.js`
imports from.

## `client/src/utils/skills.ts` (new) + `client/src/utils/index.ts`

`formatSkillScanError` — a frontend helper that turns the backend's `issues`
array into readable text: severity-sorted, `SEVERITY · RULE_ID — message` per
line, with fallbacks to `message`/`error` if there's no structured `issues`
list. This is what lets the UI show *which* rule blocked a skill instead of a
generic "creation failed."

## `client/src/components/Skills/dialogs/CreateSkillDialog.tsx` + `UploadSkillDialog.tsx`

Swap their old ad-hoc error-message extraction for `formatSkillScanError`, so
a scan failure now surfaces the specific blocking finding(s) in the toast
instead of a generic error.

## `librechat.yaml`

Adds `interface.skills.use` / `create: true` (and `interface.remoteAgents`
alongside it) — this is the config-level toggle for the Skills feature
itself; unrelated to the scanner specifically, just landed in the same
commit.

## `.env.example`

Documents the four new env vars this all depends on:

| Var | Purpose |
|---|---|
| `SKILL_SCANNER_URL` | Scanner endpoint. Unset = scanning disabled entirely. |
| `SKILL_SCANNER_BEARER_TOKEN` | Auth token sent to the scanner. |
| `SKILL_SCANNER_TIMEOUT_MS` | Request timeout, default `15000`. |
| `SKILL_SCANNER_MIN_SEVERITY` | Lowest severity that blocks, default `low`. |

---

## Net effect

Every way a skill's content can enter LibreChat (write, edit, upload `.md`,
upload `.zip`/`.skill`, add a file to an existing skill) now funnels through
the same scanner gate before it touches the database, with a consistent
422 + structured-issues response shape across all three server-side call
sites.
