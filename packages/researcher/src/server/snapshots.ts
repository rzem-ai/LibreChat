import { createHash, randomBytes } from 'node:crypto';
import { logger as defaultLogger } from '@librechat/data-schemas';
import type { SnapshotSourceKind } from '../contract/types';
import type { ISnapshot, ResearchMethods } from '../db';
import type { SnapshotReader } from './verify';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_BATCH = 500;
const MAX_SWEEP_BATCHES = 200;

/**
 * Where snapshot bodies live. The host backs this with the deployment's file strategy
 * (local, S3, Azure, ...); the module only ever sees keys.
 */
export interface SnapshotStorage {
  save(input: {
    key: string;
    markdown: string;
    userId: string | null;
    tenantId?: string;
  }): Promise<{ storageKey: string; fileStrategy: string }>;
  read(
    snapshot: Pick<ISnapshot, 'storageKey' | 'fileStrategy'>,
    signal?: AbortSignal,
  ): Promise<string | null>;
  remove(snapshot: Pick<ISnapshot, 'storageKey' | 'fileStrategy' | 'user'>): Promise<void>;
}

export type RecordSnapshotInput = {
  /** Owner; null for shared feed items. */
  userId: string | null;
  tenantId?: string;
  sourceKind: SnapshotSourceKind;
  /** URL or link for web and feed items, or a stable id for documents and uploads. */
  reference: string;
  /** When true, `reference` is already stable and is stored as given (design 5.4). */
  stableReference?: boolean;
  url?: string;
  title?: string;
  feedId?: string;
  markdown: string;
};

export type SnapshotRecorder = {
  record(input: RecordSnapshotInput): Promise<ISnapshot>;
  reader: SnapshotReader;
};

function newSnapshotId(): string {
  return `snap_${randomBytes(9).toString('base64url')}`;
}

/**
 * Every source becomes a snapshot before the agent sees it: the body goes to storage,
 * a small metadata row goes to Mongo. Web references get the fetch time appended so the
 * stable reference is "URL plus fetch time".
 */
export function createSnapshotRecorder(deps: {
  methods: Pick<ResearchMethods, 'createSnapshot'>;
  storage: SnapshotStorage;
  now?: () => Date;
}): SnapshotRecorder {
  const now = deps.now ?? (() => new Date());

  async function record(input: RecordSnapshotInput): Promise<ISnapshot> {
    const id = newSnapshotId();
    const fetchedAt = now();
    const owner = input.userId ?? 'shared';
    const { storageKey, fileStrategy } = await deps.storage.save({
      key: `research/${owner}/${id}.md`,
      markdown: input.markdown,
      userId: input.userId,
      tenantId: input.tenantId,
    });
    const reference = input.stableReference
      ? input.reference
      : `${input.reference}@${fetchedAt.toISOString()}`;
    return deps.methods.createSnapshot({
      id,
      user: input.userId as unknown as ISnapshot['user'],
      sourceKind: input.sourceKind,
      reference,
      ...(input.url ? { url: input.url } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.feedId ? { feedId: input.feedId } : {}),
      storageKey,
      fileStrategy,
      contentHash: createHash('sha256').update(input.markdown).digest('hex'),
      bytes: Buffer.byteLength(input.markdown),
      fetchedAt,
    });
  }

  return {
    record,
    reader: { read: (snapshot, signal) => deps.storage.read(snapshot, signal) },
  };
}

export type SweepResult = { scanned: number; deleted: number; storageFailures: number };

/**
 * Deletes snapshots older than `retentionDays` unless archived. The stored body is
 * removed first and the row only after that succeeds, so a storage outage leaves the
 * row for the next sweep instead of orphaning the object. Idempotent across replicas.
 */
export async function sweepSnapshots(params: {
  methods: Pick<ResearchMethods, 'findExpiredSnapshots' | 'deleteSnapshotsByIds'>;
  storage: SnapshotStorage;
  retentionDays: number;
  now?: Date;
  batchSize?: number;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn'>;
}): Promise<SweepResult> {
  const { methods, storage } = params;
  const log = params.logger ?? defaultLogger;
  const cutoff = new Date((params.now ?? new Date()).getTime() - params.retentionDays * DAY_MS);
  const batchSize = params.batchSize ?? DEFAULT_SWEEP_BATCH;
  const result: SweepResult = { scanned: 0, deleted: 0, storageFailures: 0 };
  const failed = new Set<string>();

  for (let batch = 0; batch < MAX_SWEEP_BATCHES; batch++) {
    const expired = (await methods.findExpiredSnapshots(cutoff, batchSize + failed.size)).filter(
      (snapshot) => !failed.has(snapshot.id),
    );
    if (expired.length === 0) {
      break;
    }
    result.scanned += expired.length;
    const removable: string[] = [];
    await Promise.all(
      expired.map(async (snapshot) => {
        try {
          await storage.remove(snapshot);
          removable.push(snapshot.id);
        } catch (error) {
          failed.add(snapshot.id);
          result.storageFailures += 1;
          log.warn(`[research] Snapshot sweep could not remove ${snapshot.id}`, error);
        }
      }),
    );
    result.deleted += await methods.deleteSnapshotsByIds(removable);
    if (expired.length < batchSize) {
      break;
    }
  }

  log.info(
    `[research] Snapshot sweep: ${result.deleted} deleted, ${result.storageFailures} storage failures, ${result.scanned} scanned (cutoff ${cutoff.toISOString()})`,
  );
  return result;
}

/** True once per UTC day, during `sweepHour`. `lastSweepDay` is a `YYYY-MM-DD` UTC date. */
export function isSweepDue(
  now: Date,
  sweepHour: number,
  lastSweepDay: string | undefined,
): boolean {
  const today = now.toISOString().slice(0, 10);
  return now.getUTCHours() === sweepHour && lastSweepDay !== today;
}
