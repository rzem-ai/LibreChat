# patches/

`.patch` files here are applied to `node_modules/` by [`patch-package`](https://github.com/ds300/patch-package)
on `postinstall`. They are the mechanism we use to carry local fixes for
upstream bugs until they land in a released version we can upgrade to.

## Current patches

### `@opentelemetry+otlp-exporter-base+0.218.0.patch`

Fixes a bug in the OTLP HTTP transport where `Content-Length` is never set
on outgoing requests, causing Node's HTTP client to fall back to
`Transfer-Encoding: chunked`. Azure Monitor's DCR OTLP endpoint rejects
chunked requests with `400 MissingContentLengthHeader`.

- Full context, repro, and upstream PR draft: [`../OTEL_UPSTREAM_PR.md`](../OTEL_UPSTREAM_PR.md)
- Regression test: [`packages/api/src/telemetry/content-length.spec.ts`](../packages/api/src/telemetry/content-length.spec.ts)

## Adding / updating a patch

1. Edit files inside `node_modules/<pkg>/…`.
2. Run `npx patch-package <pkg>` from the repo root.
3. `patches/<pkg>+<version>.patch` will be regenerated.
4. Commit the patch file.

## Removing a patch

Once the upstream fix ships in a version we consume, delete the patch file
and bump the affected package. If `patches/` ends up empty, also remove
`patch-package` from `devDependencies`, drop the `postinstall` script from
`package.json`, and remove the `COPY patches ./patches` lines from
`Dockerfile` and `Dockerfile.multi`.
