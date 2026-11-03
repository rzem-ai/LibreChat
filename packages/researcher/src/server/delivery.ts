import { createHash } from 'node:crypto';
import { getStorageMetadata } from '@librechat/api';
import { Constants, EModelEndpoint, FileContext } from 'librechat-data-provider';
import type { IVerificationSummary, ResearchHostMethods } from '../db';
import type { DeliverReportInput } from './service';
import { escapeMarkdownInline } from './report';

/** Writes report bytes through the deployment's file strategy (private uploads path). */
export interface ReportStorage {
  saveBuffer(input: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    tenantId?: string;
  }): Promise<{ filepath: string; source: string }>;
}

const SENDER = 'Research';

/** Deterministic UUID-shaped id (version and variant bits set) derived from a seed. */
export function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function deliveryText(input: {
  title: string;
  summary: IVerificationSummary;
  partial: boolean;
  link: string;
}): string {
  const { summary } = input;
  const lines = [
    `**${escapeMarkdownInline(input.title)}**`,
    '',
    `Verification: ${summary.supported} supported, ${summary.unsupported} unverified, ${summary.unavailable} source unavailable (${summary.total} citations).`,
  ];
  if (input.partial) {
    lines.push(
      '',
      'This is a partial report: the research budget ran out before the job finished.',
    );
  }
  lines.push('', `[Download the report](${input.link})`);
  return lines.join('\n');
}

/**
 * Delivers a report to the job's conversation: the markdown goes through the file
 * strategy, a durable File row records it, and a host-authored message links to it in
 * the `files/<user>/<file>/<name>` form the client downloads. Ids derive from the job
 * id, so a retried delivery rewrites the same file and message instead of duplicating.
 */
export function createConversationReportDelivery(deps: {
  methods: Pick<ResearchHostMethods, 'createFile' | 'saveMessage' | 'saveConvo'>;
  storage: ReportStorage;
}): (input: DeliverReportInput) => Promise<{ fileId: string }> {
  return async (input) => {
    const { job } = input;
    const userId = String(job.user);
    const fileId = stableUuid(`${job.id}:report-file`);
    const messageId = stableUuid(`${job.id}:report-message`);
    const buffer = Buffer.from(input.markdown, 'utf8');

    const { filepath, source } = await deps.storage.saveBuffer({
      userId,
      buffer,
      fileName: `${fileId}__${input.filename}`,
      ...(job.tenantId ? { tenantId: job.tenantId } : {}),
    });
    await deps.methods.createFile(
      {
        user: userId as never,
        ...(job.tenantId ? { tenantId: job.tenantId } : {}),
        file_id: fileId,
        filename: input.filename,
        filepath,
        type: 'text/markdown',
        bytes: buffer.byteLength,
        source,
        context: FileContext.message_attachment,
        conversationId: job.conversationId,
        messageId,
        ...getStorageMetadata({ filepath, source }),
      },
      true,
    );
    await deps.methods.saveMessage(
      { userId },
      {
        messageId,
        conversationId: job.conversationId,
        parentMessageId: input.parentMessageId ?? Constants.NO_PARENT,
        sender: SENDER,
        text: deliveryText({
          title: input.title,
          summary: input.summary,
          partial: job.partial,
          link: `files/${userId}/${fileId}/${input.filename}`,
        }),
        endpoint: EModelEndpoint.agents,
        model: job.agentId,
        isCreatedByUser: false,
        unfinished: false,
        ...(job.tenantId ? { tenantId: job.tenantId } : {}),
      },
      { context: 'research report delivery' },
    );
    await deps.methods.saveConvo(
      { userId },
      { conversationId: job.conversationId },
      { context: 'research report delivery', noUpsert: true },
    );
    return { fileId };
  };
}
