# Live E2E on CI — status, blockers, and runner requirements

Last updated: 2026-08-20.

Companion doc: [why we use Edge instead of bundled Chromium](e2e-runner-browser-choice.md).

---

## 1. Where we got to

The `live` job in [.github/workflows/playwright-tests.yml](../../.github/workflows/playwright-tests.yml)
runs on a **borrowed, temporary** Windows build server and is currently blocked
on network access to the target site. Everything upstream of that works.

| Stage | Status |
|---|---|
| Job picked up by self-hosted runner | Working |
| Corporate CA trust for Node (`npm ci`) | Working |
| Browser available (Edge) | Working |
| Credentials delivered from GitHub environment | Working |
| Reach `librechat-dev.ctk.au.deloitte.com` from runner | **Blocked** |
| Log the test account in | **Blocked** (SSO-only + no access) |
| Run the live specs | Not yet reached |

---

## 2. Problems solved along the way

Recorded so they aren't rediscovered on the next runner.

**Job queued forever ("Waiting for a runner").**
`runs-on` demanded a `linux` label; the runner is Windows. GitHub gives no error
for unsatisfiable labels — it queues indefinitely. Now targets the runner group
only.

**`npm ci` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.**
The network performs TLS inspection and Node keeps its own trust store, separate
from Windows. Resolved in-workflow by building a CA bundle from
`deloitte/certificates/*.crt` and exporting `NODE_EXTRA_CA_CERTS`.

**`playwright install chromium` hung at 100%.**
Download completed, extraction stalled — the signature of endpoint protection
scanning the unpacked files. Reproduced manually on the server. Resolved by
driving the preinstalled Edge instead (`E2E_CHROMIUM_CHANNEL=msedge`). The
Playwright Docker image is not an option: it is a Linux container and the runner
is Windows.

**Secrets arrived empty.**
Environment secrets under `playwright-dev`. A preflight step now fails fast and
names the missing secret rather than failing obscurely inside the login script.

---

## 3. Current blockers

### 3.1 Network — the runner cannot reach the site

```
Test-NetConnection librechat-dev.ctk.au.deloitte.com -Port 443
TcpTestSucceeded: False
```

Edge on the server also cannot load the URL, confirming this is infrastructure,
not tooling. Note the site loads fine from a **laptop on VPN** — the VPN pool and
the datacentre segment hosting the build server have different egress rules.

**Ask the network team:**

- Can `AUSYDIP60269` reach `librechat-dev.ctk.au.deloitte.com` on TCP 443, and if
  not, what is required to allow it?
- Does that host resolve in DNS from the build server's network segment?
- Is outbound traffic from that segment expected to go through an explicit proxy?
  If so, what is the proxy URL and any no-proxy list? (The workflow can set
  `HTTPS_PROXY` / `NO_PROXY` if needed.)
- Is the restriction segment-wide, or specific to this destination?

### 3.2 Identity — SSO-only, and the account lacks access

The dev site presents a single **"Login with SSO"** button; there is no
email/password form. Signing in with a personal Deloitte account returns:

> The signed in user '…' is blocked because they are not a direct member of a
> group with access

**Ask the identity team:**

- Please create a service/test account for automated E2E (currently a personal
  account is used as a placeholder).
- It must be a **direct** member of the group granted access to the LibreChat dev
  app registration. Entra does not honour nested group membership for app
  assignment — this is the exact cause of the error above.
- It must be exempt from MFA, or excluded via a scoped Conditional Access policy.
  Automation cannot satisfy an interactive MFA prompt.
- Confirm the password does not expire, or tell us the rotation period so the
  GitHub secret can be updated on schedule.

### 3.3 Application — is there a non-SSO path on dev?

**Ask the app/dev team:**

- Can `ALLOW_EMAIL_LOGIN` be enabled on the **dev** environment for a seeded test
  account?

This is the highest-leverage question in this document. If yes, the existing
[login-live.mjs](../../e2e/login-live.mjs) works as written and the entire SSO
automation problem disappears. If no, the script must drive Microsoft's sign-in
pages, which is materially more fragile and hard-depends on the MFA exemption.

---

## 4. Requirements for the future dedicated runner

The current server is borrowed and shared — one job at a time, shared with other
teams, and not provisioned for browser automation. When the team builds a
dedicated runner, these are the requirements gathered from this exercise.

**Placement**
- Network segment with routed access to the target environments on 443.
- Confirm DNS resolution for the internal zone before build-out.

**OS**
- Linux strongly preferred. The Playwright Docker image, `--with-deps`, and the
  bulk of community tooling assume Linux. Windows worked, but every step needed
  a workaround.
- Consider Actions Runner Controller in the existing AKS cluster instead of a
  VM — autoscaling, no per-machine patching, and it is already inside the network.

**Image**
- Node.js 24.16.0.
- Browsers baked in at image-build time via `npx playwright install --with-deps`,
  or a persistent `PLAYWRIGHT_BROWSERS_PATH` shared across jobs.
- Corporate CA configured at image level so individual workflows don't have to.
- Endpoint-protection exclusion for the browser cache directory.

**GitHub configuration**
- A distinct runner label (e.g. `librechat-e2e`) so workflows can target it
  precisely rather than by group.
- Never enable it for pull requests from forks.

**Concurrency**
- More than one runner if live and mock suites are expected to run concurrently.

---

## 5. Interim workarounds if unblocking takes time

- Keep the mock suite as the everyday signal — it needs no network, no accounts,
  and no VPN, and it already runs on GitHub-hosted machines.
- Consider running live tests against a locally hosted instance on the runner
  rather than the remote dev site, which removes the network dependency but tests
  less.

---

## 6. Open questions for the developer

1. Was the live suite ever run against the SSO-only dev site, or only against a
   local instance? This determines whether the specs themselves are known-good.
2. Do any live specs mutate shared state on dev (skills toggled, conversations
   deleted)? If several people share the environment, this needs coordination.
3. Should the live suite be a post-deployment gate, or a scheduled nightly?
4. `capture-live.mjs` is interactive and cannot run in CI. Once
   `login-live.mjs` works, should it be removed to avoid confusion?
