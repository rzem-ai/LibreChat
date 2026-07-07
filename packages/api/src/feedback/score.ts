import { createHash } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import type { TFeedback } from 'librechat-data-provider';
import { getLangfuseConfig } from './client';
import type { LangfuseConfig } from './client';

/** Deterministic score ID keyed on messageId so re-rating upserts the same row. */
function scoreId(messageId: string): string {
  const h = createHash('sha256').update(`${messageId}:user-feedback`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Resolve the Langfuse trace ID for a given messageId by querying trace metadata. */
async function resolveTraceId(cfg: LangfuseConfig, messageId: string): Promise<string | undefined> {
  try {
    const url = `${cfg.baseUrl}/api/public/traces?limit=1&metadata[messageId]=${encodeURIComponent(messageId)}`;
    const response = await fetch(url, {
      headers: { Authorization: cfg.authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    return body.data?.[0]?.id;
  } catch {
    return undefined;
  }
}

export async function pushFeedbackScore({
  messageId,
  feedback,
}: {
  messageId: string;
  feedback: TFeedback;
}): Promise<void> {
  const cfg = getLangfuseConfig();
  if (!cfg) return;
  const traceId = await resolveTraceId(cfg, messageId);
  if (!traceId) {
    logger.warn(`[Langfuse] No trace found for message ${messageId}, skipping score push`);
    return;
  }
  const tagText = typeof feedback.tag === 'string' ? feedback.tag : feedback.tag?.key;
  const parts = [tagText, feedback.text].filter((s): s is string => Boolean(s));
  const comment = parts.length > 0 ? parts.join(' — ') : undefined;
  try {
    const response = await fetch(`${cfg.baseUrl}/api/public/scores`, {
      method: 'POST',
      headers: { Authorization: cfg.authHeader, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        id: scoreId(messageId),
        traceId,
        name: 'user-feedback',
        value: feedback.rating === 'thumbsUp' ? 1 : 0,
        dataType: 'NUMERIC',
        ...(comment != null && { comment }),
      }),
    });
    if (!response.ok) {
      logger.warn(`[Langfuse] Score push returned ${response.status} for message ${messageId}`);
    }
  } catch (err) {
    logger.error('[Langfuse] Failed to push feedback score:', err);
  }
}

export async function deleteFeedbackScore({ messageId }: { messageId: string }): Promise<void> {
  const cfg = getLangfuseConfig();
  if (!cfg) return;
  try {
    const response = await fetch(`${cfg.baseUrl}/api/public/scores/${scoreId(messageId)}`, {
      method: 'DELETE',
      headers: { Authorization: cfg.authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      logger.warn(`[Langfuse] Score delete returned ${response.status} for message ${messageId}`);
    }
  } catch (err) {
    logger.error('[Langfuse] Failed to delete feedback score:', err);
  }
}
