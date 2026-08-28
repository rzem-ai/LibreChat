import { context, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { Span } from '@opentelemetry/api';
import { withDetachedTraceParent } from './context';

function makeSpan(traceId: string, spanId: string): Span {
  return trace.wrapSpanContext({ traceId, spanId, traceFlags: 1 });
}

describe('withDetachedTraceParent', () => {
  let contextManager: AsyncLocalStorageContextManager;

  beforeEach(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    contextManager.disable();
    context.disable();
  });

  it('removes the ambient span so inner work runs at the trace root', () => {
    const ambient = makeSpan('0123456789abcdef0123456789abcdef', '0123456789abcdef');

    const seen = context.with(trace.setSpan(ROOT_CONTEXT, ambient), () => {
      expect(trace.getSpan(context.active())).toBe(ambient);
      return withDetachedTraceParent(() => trace.getSpan(context.active()));
    });

    expect(seen).toBeUndefined();
  });

  it('preserves the detachment across awaits inside the action', async () => {
    const ambient = makeSpan('fedcba9876543210fedcba9876543210', 'fedcba9876543210');

    const seen = await context.with(trace.setSpan(ROOT_CONTEXT, ambient), () =>
      withDetachedTraceParent(async () => {
        await Promise.resolve();
        return trace.getSpan(context.active());
      }),
    );

    expect(seen).toBeUndefined();
  });

  it('returns the action result and is a no-op when no span is active', () => {
    expect(trace.getSpan(context.active())).toBeUndefined();
    const result = withDetachedTraceParent(() => {
      expect(trace.getSpan(context.active())).toBeUndefined();
      return 'ok';
    });
    expect(result).toBe('ok');
  });
});
