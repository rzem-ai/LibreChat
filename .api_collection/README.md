# LibreChat MCP — Postman (DEV)

Query LibreChat's MCP API on DEV to inspect the MCP servers it has configured (tools, connection
status, reconnect) and — optionally — make an agent actually invoke an MCP tool.

**Validated live** against `https://librechat-dev.ctk.au.deloitte.com` with a real session:
`/api/mcp/tools`, `/api/mcp/connection/status`, and `/api/mcp/servers` all return **200** when the
Bearer is sent with **both** cookies (`token_provider=openid` + `openid_user_id`). Sending the
Bearer with fewer than both cookies returns exactly `401 {"message":"invalid algorithm"}` — so if
you see that error, a cookie is missing (see step 4).

---

## Files you need

All in this folder — `librechat-mcp-postman/`:

| File | Required? | What it is |
|---|---|---|
| `LibreChat_MCP.postman_collection.json` | **Yes** | The requests. Import into Postman. |
| `LibreChat_MCP.postman_environment.json` | **Yes** | Variables (`base_url`, `token`, `openid_user_id`, …). Import + select. |
| `README.md` | No | This guide. |

Nothing else. No local LibreChat, no Node, no build step.

---

## Setup (do once)

### 1. Import
- Postman → **Import** → drag in **both** JSON files.
- Top-right environment dropdown → select **LibreChat MCP — DEV**.

### 2. Understand the auth (why the usual token fails)
DEV uses **Azure Entra SSO** with **`OPENID_REUSE_TOKENS=true`**. The API accepts your **Azure
access token (RS256)** as the Bearer **only if** the request also carries the cookie
`token_provider=openid` (+ `openid_user_id`). With the Bearer alone, the server falls back to its
HS256 path and rejects the RS256 token with **`401 invalid algorithm`** — the error you hit.
So you must supply the Bearer **and** the cookie values.

### 3. Get your two credentials from the browser

You need **two** values from a logged-in browser session:

1. a **Bearer token** — goes into the `token` variable (step 4.1).
2. an **`openid_user_id`** value — goes into a cookie (step 4.2).

#### First, log in
1. Open `https://librechat-dev.ctk.au.deloitte.com` in **Chrome or Edge** and sign in with SSO.
   (You must be in the `AU_App_MyGenAI_Dev` Entra group — request access if you can't log in.)
2. Wait for the chat screen to finish loading.
3. Open **DevTools**: press **F12** (or right-click the page → **Inspect**). A panel opens with tabs
   across the top — you'll use **Network** and **Application**.

#### A. Copy the Bearer token
1. Click the **Network** tab.
2. In its filter box, type `api` so the list only shows API calls.
3. Reload the page (**Cmd/Ctrl + R**) so requests appear.
4. Click a row named `user` or `config` whose URL is
   `https://librechat-dev.ctk.au.deloitte.com/api/...`.
   ⚠️ Do **not** pick a request to `mcp-gw-dev...` — that token is for a different app and will fail.
5. Open **Headers → Request Headers** and find the line starting `authorization:`.
6. Copy everything **after** the word `Bearer ` — one long string starting with `eyJ...`.
   **That is your token.**

#### B. Copy the `openid_user_id` value
1. Click the **Application** tab in DevTools.
2. In the left sidebar, expand **Cookies** → click `https://librechat-dev.ctk.au.deloitte.com`.
3. Find the row named **`openid_user_id`** and copy its **Value** (another long `eyJ...` string).
   (It shows `HttpOnly`, but you can still read and copy it here.)

Keep this browser tab open — you'll re-copy a fresh Bearer from it whenever the old one expires
(~15–30 min). The `openid_user_id` value lasts ~7 days, so you only grab it once a week.

#### (Optional) Confirm the token is for the right app
The token's `aud` must be `2075976d-...`. To check before pasting:

```bash
node -e 'const b=JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64url"));console.log("aud =",b.aud,b.aud==="2075976d-5147-47b2-89d2-4ad060d19f85"?"OK - LibreChat":"WRONG app")' 'PASTE_TOKEN'
```

The collection checks this for you too: if the token is for the wrong app or expired, its
pre-request script prints a warning in the Postman console.

### 4. Put them into Postman (the exact steps that work)

You need **two** things in place: the `token` env var **and** two cookies in the cookie jar.
Missing a cookie → `401 {"message":"invalid algorithm"}` (verified live).

**4.1 — Set the token variable**
1. Left sidebar → **Environments** → **LibreChat MCP — DEV**.
2. In the `token` row, paste your Bearer (the `eyJ…` after `Bearer `) into the **Value** column.
3. **Save** (Cmd/Ctrl+S).

**4.2 — Add BOTH cookies (this is the step that fixes `invalid algorithm`)**
1. Open any request, e.g. **0 · Health & connectivity → 0d · Token valid?**
2. Below the address bar, click the **Cookies** link → **Manage Cookies** opens.
3. If `librechat-dev.ctk.au.deloitte.com` isn't listed → **Add Domain** → type
   `librechat-dev.ctk.au.deloitte.com` → **Add**.
4. With that domain selected, click **+ Add Cookie**, replace the sample with this **exact** line,
   then **Save**:
   ```
   token_provider=openid; path=/; Secure
   ```
5. Click **+ Add Cookie** again, paste this line (your real `openid_user_id`), then **Save**:
   ```
   openid_user_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<the-rest-of-your-openid_user_id>; path=/; Secure
   ```
   A real value looks like a 3-part JWT, e.g.:
   ```
   openid_user_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMGQ0YWY0M2JjNjBjNzk1ZTYyMzE0MCIsImlhdCI6MTc4NDY3OTIzOSwiZXhwIjoxNzg1Mjg0MDM5fQ.xSm7UUokBqi2njlQbXByDb7rA-WDAExiD32xtJSNp1o; path=/; Secure
   ```
6. Confirm **two** cookies now show under the domain. Close the dialog.

**4.3 — Run**
- Send **0d · Token valid?** → expect **200** with your user JSON.
- Then run **1 → 2 → 3 → 5** (or use the Collection Runner).

**Convenience alternative (skip 4.2's manual cookies):** add the domain to
**Cookies → Domains Allow List**, and set the `openid_user_id` env var. The pre-request script then
injects both cookies for you. If you skip the allow-list the script can't set cookies and you'll get
`invalid algorithm` — so the manual method in 4.2 is the reliable one.

### Credential mapping (quick reference)

From one working browser request to `librechat-dev.../api/...`
(DevTools → Network → Request Headers), map three things:

| Browser source | Goes to | Lifetime | Notes |
|---|---|---|---|
| `Authorization: Bearer eyJ…` (the part after `Bearer `) | env var **`token`** | **~15–30 min** | `aud` must be `2075976d-…`. Re-copy whenever you get a 401. |
| `Cookie: … openid_user_id=eyJ…` | env var **`openid_user_id`** | **~7 days** | Signed by LibreChat; set once per week. |
| `Cookie: … token_provider=openid` | (nothing to set) | — | The pre-request script always sends this. |

You do **not** paste `refreshToken`, `oauth_session`, analytics cookies, etc. — only the two above.
Fastest capture: right-click the request → **Copy → Copy as cURL**, then Postman
**Import → Raw text** to see the same values.

> ⚠️ The Bearer, `openid_user_id`, and `refreshToken` are live credentials. Don't share them; log
> out of LibreChat when done to invalidate them.

---

## Run

Run the folders **in order** (Collection Runner, or top-to-bottom). Open the Postman console
(**View → Show Postman Console**) to see the logged output.

| # | Folder / request | Endpoint | Auth |
|---|---|---|---|
| 0a | Server up | `GET /health` | none |
| 0b | Server ready | `GET /readyz` | none |
| 0c | API layer + auth methods | `GET /api/config` | none |
| 0d | **Token valid?** | `GET /api/user` | JWT |
| 1 | List MCP tools (per server) | `GET /api/mcp/tools` | JWT |
| 2 | Connection status (all) | `GET /api/mcp/connection/status` | JWT |
| 3 | Per-server status sweep | `GET /api/mcp/connection/status/:name` | JWT |
| 4 | Reinitialize `{{mcp_server}}` | `POST /api/mcp/:name/reinitialize` | JWT |
| 5 | Coverage report | (summary of 1–3) | JWT |
| 6 | Call MCP via agent chat | see below | JWT |

**Gate check:** get `0d` (`GET /api/user`) green first. If `0d` works, 1–5 will too. If it returns
`401 invalid algorithm`, your cookie isn't attached — recheck step 4. Tokens expire ~15 min; on a
401 later, refresh the Bearer (and `openid_user_id` if it rotated) and re-run.

---

## What to expect on DEV (requests 1–5)

DEV has two MCP servers, both the ClearTrack gateway over **per-user OAuth**:
`cleartrack-gateway-new-appreg` (default `{{mcp_server}}`) and `cleartrack-gateway-llm-appreg`.

Until you complete the gateway OAuth, they report `requiresOAuth: true`, a non-`connected` state,
and `GET /api/mcp/tools` returns **0 tools**. The collection treats this as expected (warnings, not
failures). To see them `connected` with tools, complete the per-server OAuth in the LibreChat UI, or
open the `oauthUrl` returned by request 4, then re-run.

---

## Folder 6 — actually calling an MCP tool (optional)

LibreChat has **no** REST endpoint that runs an MCP tool by name; a tool only fires when an agent's
LLM decides to call it. Folder 6 drives that:

1. **6a** `GET /api/agents` — pick an `agent_id` (prefers one with MCP tools).
2. **6b** `POST /api/agents/chat/agents` — sends `{{prompt}}`; returns `{ streamId }`.
3. **6c** `GET /api/agents/chat/stream/:streamId` — SSE; **open in the request tab** (not the
   Runner) to watch the `tool_call` events fire.
4. **6d** `GET /api/agents/chat/status/:conversationId` — final answer + which tools ran.

Requires: an **agent with MCP tools attached** (create in the UI), the **gateway OAuth completed**,
and a working **model endpoint** (VertexAI Gemini). It's LLM-driven and SSE-based — for exploration,
not clean pass/fail. For deterministic `tools/call` with explicit args, hit the **MCP gateway**
directly (see `ea-mcp-gateway/postman`).

### `event: error` / `{"message":"Illegal request"}` on 6a/6b

`/api/agents/*` is guarded by a **browser User-Agent check** (`uaParser`): if the `User-Agent`
isn't recognized as a browser, LibreChat returns `Illegal request` **and logs a non-browser
violation** (repeat offenders get temporarily banned). Postman's default `PostmanRuntime/…` UA is
rejected — which is why 6a/6b fail while the MCP folders (1–5, no such guard) work.

**Fix (already built in):** the collection's pre-request script sets a browser `User-Agent`
(`Mozilla/5.0 … Chrome/126 …`) on every request, so folder 6 is accepted. If you build your own
agent request outside this collection, add that `User-Agent` header yourself. Don't retry 6a/6b
repeatedly with the default UA — each rejection adds to the violation score.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `0a`/`0b` fail | wrong `base_url` / not on network | check `base_url`, VPN |
| `0c` fails | `/api` not routing | proxy/base-path issue |
| `0d` → `401 invalid algorithm` | Bearer sent without **both** cookies | add `token_provider=openid` **and** `openid_user_id` in Manage Cookies (step 4.2) |
| `6a`/`6b` → `event: error` `{"message":"Illegal request"}` | non-browser `User-Agent` on `/api/agents/*` | built-in pre-request script sets a browser UA — re-import the latest collection (don't spam retries; it logs violations) |
| `0d` → `401 invalid audience` / still failing with cookie set | **wrong token** — copied from `mcp-gw-dev...` (aud `3e5d28f1...`) not LibreChat (aud `2075976d...`) | copy the Bearer from a request to `librechat-dev.../api/...`; verify `aud` (see below) |
| `0d` → `401` other | token missing/expired | refresh the Bearer |
| 1–5 show 0 tools / OAuth pending | gateway OAuth not done | authorize via UI or request 4's `oauthUrl` |
| `6a` → no agents | none created | create an agent with MCP tools in the UI |
