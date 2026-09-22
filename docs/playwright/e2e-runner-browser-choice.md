# Why the live E2E job uses Edge instead of bundled Chromium

Status: temporary workaround, tied to the shared build server.
Applies to: the `live` job in [.github/workflows/deloitte.playwright-live.yml](../../.github/workflows/deloitte.playwright-live.yml).

## Summary

On the shared runner (`AUSYDIP60269`, runner group *AU ITS DevOps Build Servers*) the
live job drives the machine's preinstalled Microsoft Edge via
`E2E_CHROMIUM_CHANNEL=msedge`, and sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so
Playwright never fetches its own browser.

This is not a preference. `npx playwright install chromium` cannot currently
complete on that machine.

## What actually happened

1. `npm ci` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. The network performs
   TLS inspection, and Node maintains its own trust store independent of Windows,
   so it rejects the interception certificate. Fixed in-repo by building a CA
   bundle from `deloitte/certificates/*.crt` and exporting `NODE_EXTRA_CA_CERTS`.
2. `npx playwright install chromium` then reached `100%` on the
   `chromium-win64.zip` download and hung indefinitely — killed after 15 minutes.
   A completed download that stalls during verification/extraction points at
   endpoint protection scanning the extracted files, not at network throughput.
3. Running the same install by hand on the server reproduced the certificate
   error, confirming it is environmental rather than a workflow defect.

## Why not the Playwright Docker image

The `mcr.microsoft.com/playwright` image used by the mock job is a **Linux**
container. The `container:` key requires a Linux runner. This runner is Windows,
so the image cannot be used here regardless of Docker availability.

## Why Edge is an acceptable substitute

- Edge is Chromium. Same Blink rendering engine, same V8, same CDP automation
  protocol Playwright drives.
- Playwright supports it as a first-class channel; only the browser binary
  changes, no test code does.
- Version drift is bounded — Edge tracks Chromium stable closely.
- It is preinstalled and serviced by SOE patching, so there is nothing to
  download, extract, or antivirus-exclude.
- The repo already relies on this mechanism: the mock job sets
  `E2E_CHROMIUM_CHANNEL=chrome`.

## Known trade-offs

- Not byte-identical to the Chromium build Playwright pins, so a rendering bug
  present in one and not the other is theoretically possible. For smoke-level
  coverage this risk is negligible.
- Visual snapshot comparisons across Edge and bundled Chromium are not reliable.
  Do not baseline screenshots on one and assert on the other.
- Firefox and WebKit coverage is not possible on this runner without solving the
  download problem first.

## Reverting to bundled Chromium

The channel is opt-in via environment variable — no code change is needed to go
back. On a runner where the team controls the image:

1. Remove `E2E_CHROMIUM_CHANNEL` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` from the
   `live` job env block.
2. Restore the `npx playwright install chromium` step (add `--with-deps` if the
   runner is Linux).
3. Ensure either an antivirus exclusion for the browser cache directory, or a
   prewarmed shared `PLAYWRIGHT_BROWSERS_PATH` baked into the image.

With no `E2E_CHROMIUM_CHANNEL` set, `playwright.config.live.ts` and
`login-live.mjs` fall back to bundled Chromium, which is what happens on
developer machines today.

## Preconditions for the revert

- Ability to run `playwright install` during image build, or a persistent
  `PLAYWRIGHT_BROWSERS_PATH` on the runner.
- Endpoint-protection exclusion for the browser cache path.
- Corporate CA trust configured at image level rather than per-workflow.
