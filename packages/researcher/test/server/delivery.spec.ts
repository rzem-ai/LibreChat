import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { IResearchJob, ResearchHostMethods } from '../../src/db';
import type { ReportStorage } from '../../src/server/delivery';
import { createConversationReportDelivery, stableUuid } from '../../src/server/delivery';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
const userId = new mongoose.Types.ObjectId().toString();
const conversationId = randomUUID();
const saved = new Map<string, Buffer>();

const storage: ReportStorage = {
  saveBuffer: async ({ userId: owner, buffer, fileName }) => {
    saved.set(`${owner}/${fileName}`, buffer);
    return { filepath: `/uploads/${owner}/${fileName}`, source: 'local' };
  },
};

const job = {
  id: 'research_abc',
  user: userId,
  agentId: RESEARCH_AGENT_IDS[ResearchJobType.CURRENT_EVENTS],
  jobType: ResearchJobType.CURRENT_EVENTS,
  conversationId,
  partial: true,
} as unknown as IResearchJob;

const input = {
  job,
  title: 'Current events research: Widgets',
  filename: 'currentEvents-report-2026-11-03.md',
  markdown: '# Report\n\nBody\n',
  summary: { supported: 3, unsupported: 1, unavailable: 0, total: 4 },
  parentMessageId: randomUUID(),
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.File.deleteMany({});
  await mongoose.models.Message.deleteMany({});
  await mongoose.models.Conversation.deleteMany({});
  saved.clear();
  await methods.saveConvo({ userId }, { conversationId, endpoint: 'agents' }, { context: 'test' });
});

describe('createConversationReportDelivery', () => {
  it('stores the report, records a durable file and posts a message linking to it', async () => {
    const deliver = createConversationReportDelivery({ methods, storage });
    const { fileId } = await deliver(input);

    const fileName = `${fileId}__${input.filename}`;
    expect(saved.get(`${userId}/${fileName}`)?.toString('utf8')).toBe(input.markdown);

    const [file] = (await methods.getFiles({ file_id: fileId })) ?? [];
    expect(file).toMatchObject({
      filename: input.filename,
      type: 'text/markdown',
      context: 'message_attachment',
      conversationId,
    });
    expect(file.expiresAt).toBeUndefined();

    const messages = await methods.getMessages({ conversationId });
    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message).toMatchObject({
      parentMessageId: input.parentMessageId,
      isCreatedByUser: false,
      model: job.agentId,
    });
    expect(message.text).toContain(`files/${userId}/${fileId}/${input.filename}`);
    expect(message.text).toContain('3 supported, 1 unverified, 0 source unavailable');
    expect(message.text).toContain('partial');
  });

  it('is idempotent when delivery is retried for the same job', async () => {
    const deliver = createConversationReportDelivery({ methods, storage });
    const first = await deliver(input);
    const second = await deliver(input);
    expect(second.fileId).toBe(first.fileId);
    expect((await methods.getFiles({ file_id: first.fileId })) ?? []).toHaveLength(1);
    expect(await methods.getMessages({ conversationId })).toHaveLength(1);
  });

  it('escapes the title it writes into the message', async () => {
    const deliver = createConversationReportDelivery({ methods, storage });
    await deliver({ ...input, title: 'X ![i](https://evil.example/p.png)' });
    const [message] = await methods.getMessages({ conversationId });
    expect(message.text).not.toContain('](https://evil.example');
  });
});

describe('stableUuid', () => {
  it('derives the same well-formed uuid from the same seed', () => {
    expect(stableUuid('a')).toBe(stableUuid('a'));
    expect(stableUuid('a')).not.toBe(stableUuid('b'));
    expect(stableUuid('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
