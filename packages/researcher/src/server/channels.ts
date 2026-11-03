import type { ResearchDeliveryChannel } from '../contract/types';
import type { IResearchJob } from '../db';

export type ChannelSendInput = {
  job: IResearchJob;
  title: string;
  /** The delivered report, as saved to the conversation. */
  markdown: string;
};

/** `code` is a stable identifier stored on the job; never raw error text. */
export type ChannelSendResult = { ok: true } | { ok: false; code: string; retryable: boolean };

/**
 * One way of delivering a finished report beyond the conversation (design 5.8). The
 * caller supplies implementations; the service owns retries, backoff and recording.
 */
export interface DeliveryChannel {
  channel: Exclude<ResearchDeliveryChannel, 'conversation'>;
  send: (input: ChannelSendInput) => Promise<ChannelSendResult>;
}

const DAY_MS = 24 * 3_600_000;

/** Exponential backoff from the base delay, capped at a day. `attempts` counts this one. */
export function deliveryRetryAt(now: Date, baseSeconds: number, attempts: number): Date {
  const delay = Math.min(DAY_MS, baseSeconds * 1000 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delay);
}
