import { context, trace } from '@opentelemetry/api';

/**
 * Runs `action` in an OTEL context with any ambient span detached, so a
 * Langfuse root span created inside becomes a true root instead of a child.
 *
 * `@librechat/agents` derives a deterministic Langfuse trace id from the run id
 * (`sha256(runId)`, matching {@link traceIdForMessage}) via a seeded
 * `IdGenerator` that only fires when it creates a *root* trace — i.e. when no
 * span is active in the OTEL context. When the process also runs the full OTEL
 * NodeSDK (HTTP/Express auto-instrumentation, e.g. `OTEL_TRACING_ENABLED=true`
 * in the dev cluster), every request has an ambient server span active, so the
 * Langfuse span is parented to it and inherits its *random* trace id — the seed
 * never applies. Feedback scoring then targets `traceIdForMessage(messageId)`,
 * which no longer matches the real trace, and the trace-level input/output ends
 * up on the HTTP span rather than the agent run.
 *
 * Stripping the active span for the duration of the run restores true-root
 * behaviour, so the deterministic id takes effect regardless of a global
 * provider. A no-op when no context manager or ambient span is present (e.g.
 * local runs without the NodeSDK), so behaviour there is unchanged.
 */
export function withDetachedTraceParent<T>(action: () => T): T {
  const detached = trace.deleteSpan(context.active());
  return context.with(detached, action);
}
