# Live E2E on CI — setup, status, and runner requirements

Last updated: 2026-08-28.

Companion doc: [why we use Edge instead of bundled Chromium](e2e-runner-browser-choice.md).

---

## 1. Where we got to

Live tests run from [.github/workflows/deloitte.playwright-live.yml](../../.github/workflows/deloitte.playwright-live.yml)
on a **borrowed, temporary** Windows build server. CI and Mock tests run
separately from [.github/workflows/deloitte.playwright-tests.yml](../../.github/workflows/deloitte.playwright-tests.yml)
on GitHub-hosted Linux runners.

| Stage | Status |
|---|---|
| Job picked up by self-hosted runner | Working |
| Corporate CA trust for Node (`npm ci`) | Working |
| Browser available (Edge) | Working |
| Credentials delivered from GitHub environment | Working |
| Reach target environment from runner | Working (Infra Cloud whitelist applied) |
| Service account delivered by GitHub Environment | Working |
| Service account access to SSO application | Working |
| Log the test account in | Working through Microsoft SSO |
| Run the live specs | Working |

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

**Service account was blocked by Entra ID.**
The service account was granted access to the SSO application and the Live
workflow now completes authentication. The account must remain a direct member
of the assigned access group and must remain exempt from MFA/interactive
Conditional Access requirements.

---

## 3. Current blockers

### 3.1 Network — resolved for the temporary runner

Infra Cloud whitelisted the target site on the server's NSX Firewall. The
temporary runner can now reach the development site and the Live workflow has
passed the network stage.

For the future dedicated runner, the network team still needs to confirm the
same outbound access for each target environment and verify DNS resolution from
the runner's network segment.

### 3.2 Identity — resolved for the current service account

The target site presents a single **"Login with SSO"** button; there is no
email/password form. The service account was initially rejected with:

> The signed in user '…' is blocked because they are not a direct member of a
> group with access

The identity team then granted the service account access. It is now used by
the automated SSO flow. Keep the access grant, direct group membership, MFA
exemption, and password rotation process documented when moving to UAT and
production.

### 3.3 Application — SSO is intentional

The environments intentionally use their real SSO process, so
`ALLOW_EMAIL_LOGIN` is not required. [login-live.mjs](../../e2e/login-live.mjs)
follows the SSO redirect, enters the service-account credentials on Microsoft
Entra ID, handles the optional "Stay signed in?" prompt, and captures the
resulting authenticated browser state.

The SSO page is an external dependency. If Microsoft changes its login markup or
Conditional Access introduces another prompt, the login helper may need an
update.

### 3.4 Environment configuration

The Live workflow selects a GitHub Environment from the PR destination branch
or the manual `target_ref`:

| Branch/ref | GitHub Environment | `E2E_BASE_URL` |
|---|---|---|
| `develop` | `playwright-dev` | `https://librechat-dev.ctk.au.deloitte.com` |
| `uat` | `playwright-uat` | `https://myassist-uat.ctk.au.deloitte.com` |
| `main` | `playwright-prod` | Production URL to be supplied |

Each environment needs:

- Secrets: `E2E_LIVE_USER`, `E2E_LIVE_PASS`
- Variable: `E2E_BASE_URL`

The manual `base_url` input is an optional override for controlled testing.

---

## 4. Workflow behavior

### Pull requests

[deloitte.playwright-tests.yml](../../.github/workflows/deloitte.playwright-tests.yml)
runs CI and Mock for pull requests targeting `develop`, `uat`, or `main`. Both
jobs check out `github.event.pull_request.head.sha`, so they test the PR source
commit. Mock runs after CI and stops if CI fails.

### Merged pull requests

[deloitte.playwright-live.yml](../../.github/workflows/deloitte.playwright-live.yml)
runs only when a pull request targeting `develop`, `uat`, or `main` is closed and
merged. It checks out `github.event.pull_request.merge_commit_sha`, so it tests
the merged destination-side code. Live can also be run manually with a target
ref and optional URL override.

## 5. Requirements for the future dedicated runner

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

## 6. Interim workarounds if unblocking takes time

- Keep the mock suite as the everyday signal — it needs no network, no accounts,
  and no VPN, and it already runs on GitHub-hosted machines.
- Consider running live tests against a locally hosted instance on the runner
  rather than the remote dev site, which removes the network dependency but tests
  less.

---

## 7. Open questions for the developer

1. Should the Live workflow run immediately after merge, or be scheduled after
  deployment has completed in each environment?
2. Do any live specs mutate shared state on dev (skills toggled, conversations
  deleted)? If several people share the environment, this needs coordination.
3. Should the service-account password rotate on a fixed schedule, and who owns
  updating the GitHub Environment secrets?
4. `capture-live.mjs` is interactive and cannot run in CI. Once
  `login-live.mjs` is the accepted path, it can be removed or retained only as
  a local debugging utility.
