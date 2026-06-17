import { createHash } from 'node:crypto';
import { pushFeedbackScore, deleteFeedbackScore } from './score';
import { resetLangfuseConfig } from './client';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const LANGFUSE_ENV = {
  LANGFUSE_PUBLIC_KEY: 'pk-test',
  LANGFUSE_SECRET_KEY: 'sk-test',
  LANGFUSE_BASE_URL: 'http://langfuse.test',
};

function scoreId(messageId: string): string {
  const h = createHash('sha256').update(`${messageId}:user-feedback`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

let mockFetch: jest.MockedFunction<typeof fetch>;
let originalFetch: typeof fetch;

const FAKE_TRACE_ID = 'abc123def456789012345678abcdef00';

function mockTraceAndScore() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: FAKE_TRACE_ID }] }),
    } as unknown as Response)
    .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
}

beforeEach(() => {
  resetLangfuseConfig();
  Object.assign(process.env, LANGFUSE_ENV);
  originalFetch = global.fetch;
  mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
  global.fetch = mockFetch;
});

afterEach(() => {
  for (const key of Object.keys(LANGFUSE_ENV)) {
    delete process.env[key];
  }
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('pushFeedbackScore', () => {
  const messageId = 'f23f3243-f6cb-361a-12c9-0a2cae2e5294';

  it('resolves trace ID then POSTs a numeric score of 1 for thumbsUp', async () => {
    mockTraceAndScore();

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [lookupUrl] = mockFetch.mock.calls[0];
    expect(lookupUrl).toContain('/api/public/traces?limit=1&metadata');
    expect(lookupUrl).toContain(messageId);
    const [scoreUrl, init] = mockFetch.mock.calls[1];
    expect(scoreUrl).toBe('http://langfuse.test/api/public/scores');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.traceId).toBe(FAKE_TRACE_ID);
    expect(body.value).toBe(1);
    expect(body.name).toBe('user-feedback');
    expect(body.dataType).toBe('NUMERIC');
    expect(body.id).toBe(scoreId(messageId));
  });

  it('POSTs a numeric score of 0 for thumbsDown', async () => {
    mockTraceAndScore();

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsDown' } });

    const body = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body.value).toBe(0);
  });

  it('includes tag key and text as comment', async () => {
    mockTraceAndScore();

    await pushFeedbackScore({
      messageId,
      feedback: {
        rating: 'thumbsDown',
        tag: { key: 'inaccurate', label: 'com_ui_feedback_tag_inaccurate', direction: 'thumbsDown', icon: 'AlertCircle' },
        text: 'Wrong answer',
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body.comment).toBe('inaccurate — Wrong answer');
  });

  it('omits comment when no tag or text', async () => {
    mockTraceAndScore();

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    const body = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body.comment).toBeUndefined();
  });

  it('sends correct Basic auth header', async () => {
    mockTraceAndScore();

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    const headers = mockFetch.mock.calls[1][1]?.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`;
    expect(headers['Authorization']).toBe(expected);
  });

  it('does not call fetch when Langfuse env vars are missing', async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    resetLangfuseConfig();

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips score push when trace lookup returns no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as unknown as Response);

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips score push when trace lookup fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    await pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch errors without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(
      pushFeedbackScore({ messageId, feedback: { rating: 'thumbsUp' } }),
    ).resolves.toBeUndefined();
  });
});

describe('deleteFeedbackScore', () => {
  const messageId = 'f23f3243-f6cb-361a-12c9-0a2cae2e5294';

  it('DELETEs the score by deterministic ID', async () => {
    await deleteFeedbackScore({ messageId });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`http://langfuse.test/api/public/scores/${scoreId(messageId)}`);
    expect(init?.method).toBe('DELETE');
  });

  it('does not call fetch when Langfuse env vars are missing', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    resetLangfuseConfig();

    await deleteFeedbackScore({ messageId });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('swallows fetch errors without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(deleteFeedbackScore({ messageId })).resolves.toBeUndefined();
  });

  it('swallows 404 without warning', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    const { logger } = await import('@librechat/data-schemas');

    await deleteFeedbackScore({ messageId });

    expect((logger.warn as jest.Mock)).not.toHaveBeenCalled();
  });
});
