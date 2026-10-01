import type { PurgeCascadeDeps } from '~/conversations/purgeCascade';
import type { ClaimedPurgeConversation } from './sweep';
import {
  purgeExpiredConversations,
  startConversationPurgeSweep,
  getConversationPurgeRetryDelay,
  getConversationPurgeBatchSize,
  getConversationPurgeMaxAttempts,
  getConversationPurgeClaimLeaseMs,
  getConversationPurgeSweepInterval,
} from './sweep';
import { purgeConversationCascade } from '~/conversations/purgeCascade';

jest.mock('~/conversations/purgeCascade', () => ({
  purgeConversationCascade: jest.fn(),
}));

type DeleteConvosResult = { conversationIds: string[] };

const mockedPurgeConversationCascade = purgeConversationCascade as jest.MockedFunction<
  typeof purgeConversationCascade
>;

describe('conversation purge sweep helpers', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  let claimExpiredConversations: jest.Mock;
  let releaseConversationPurgeClaim: jest.Mock;
  let cascadeDeps: PurgeCascadeDeps<DeleteConvosResult>;

  const claim = (overrides: Partial<ClaimedPurgeConversation> = {}): ClaimedPurgeConversation => ({
    conversationId: 'convo-1',
    user: 'user-1',
    tenantId: undefined,
    purgeClaimId: 'claim-1',
    purgeAttempts: 1,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS;
    delete process.env.CONVERSATION_PURGE_BATCH_SIZE;
    delete process.env.CONVERSATION_PURGE_SWEEP_MAX_ATTEMPTS;
    delete process.env.CONVERSATION_PURGE_CLAIM_LEASE_MS;
    claimExpiredConversations = jest.fn().mockResolvedValue([]);
    releaseConversationPurgeClaim = jest.fn().mockResolvedValue(undefined);
    cascadeDeps = {} as PurgeCascadeDeps<DeleteConvosResult>;
    mockedPurgeConversationCascade.mockResolvedValue({
      deletedConversationIds: ['convo-1'],
      dbResponse: { conversationIds: ['convo-1'] },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS;
    delete process.env.CONVERSATION_PURGE_BATCH_SIZE;
    delete process.env.CONVERSATION_PURGE_SWEEP_MAX_ATTEMPTS;
    delete process.env.CONVERSATION_PURGE_CLAIM_LEASE_MS;
  });

  describe('purgeExpiredConversations', () => {
    it('claims a batch, cascades each conversation, and releases the claim on success', async () => {
      claimExpiredConversations.mockResolvedValue([claim()]);

      const result = await purgeExpiredConversations(
        { limit: 50 },
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(claimExpiredConversations).toHaveBeenCalledWith(50, {
        leaseMs: getConversationPurgeClaimLeaseMs(),
        now: expect.any(Date),
      });
      expect(mockedPurgeConversationCascade).toHaveBeenCalledWith(
        'user-1',
        undefined,
        ['convo-1'],
        cascadeDeps,
      );
      expect(releaseConversationPurgeClaim).toHaveBeenCalledWith('convo-1', { success: true });
      expect(result).toEqual({ scanned: 1, purged: 1, failed: 0 });
    });

    it('defaults the limit to the configured batch size', async () => {
      await purgeExpiredConversations(
        {},
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(claimExpiredConversations).toHaveBeenCalledWith(
        getConversationPurgeBatchSize(),
        expect.objectContaining({ leaseMs: expect.any(Number) }),
      );
    });

    it('releases the claim with backoff and continues the batch when the cascade fails', async () => {
      claimExpiredConversations.mockResolvedValue([
        claim({ conversationId: 'convo-fails', purgeAttempts: 1 }),
        claim({ conversationId: 'convo-succeeds' }),
      ]);
      mockedPurgeConversationCascade
        .mockRejectedValueOnce(new Error('checkpoint store unreachable'))
        .mockResolvedValueOnce({
          deletedConversationIds: ['convo-succeeds'],
          dbResponse: { conversationIds: ['convo-succeeds'] },
        });

      const result = await purgeExpiredConversations(
        {},
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(logger.error).toHaveBeenCalledWith(
        '[purgeExpiredConversations] Failed to purge conversation convo-fails:',
        expect.any(Error),
      );
      expect(releaseConversationPurgeClaim).toHaveBeenCalledWith('convo-fails', {
        success: false,
        retryDelayMs: getConversationPurgeRetryDelay(1, getConversationPurgeMaxAttempts()),
      });
      expect(releaseConversationPurgeClaim).toHaveBeenCalledWith('convo-succeeds', {
        success: true,
      });
      expect(result).toEqual({ scanned: 2, purged: 1, failed: 1 });
    });

    it('logs but does not throw when releasing a failed claim itself fails', async () => {
      claimExpiredConversations.mockResolvedValue([claim()]);
      mockedPurgeConversationCascade.mockRejectedValue(new Error('cascade failed'));
      releaseConversationPurgeClaim.mockRejectedValue(new Error('mongo unreachable'));

      const result = await purgeExpiredConversations(
        {},
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(logger.error).toHaveBeenCalledWith(
        '[purgeExpiredConversations] Failed to release purge claim for convo-1:',
        expect.any(Error),
      );
      expect(result).toEqual({ scanned: 1, purged: 0, failed: 1 });
    });

    it('does not log a summary when nothing was claimed', async () => {
      const result = await purgeExpiredConversations(
        {},
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(logger.info).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 0, purged: 0, failed: 0 });
    });

    it('logs a summary once claims were processed', async () => {
      claimExpiredConversations.mockResolvedValue([claim()]);

      await purgeExpiredConversations(
        {},
        { claimExpiredConversations, releaseConversationPurgeClaim, cascadeDeps, logger },
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Processed 1 claimed conversations: 1 purged, 0 failed'),
      );
    });
  });

  describe('getConversationPurgeRetryDelay', () => {
    it('doubles from the sweep interval up to a day, then parks at the attempt cap', () => {
      expect(getConversationPurgeRetryDelay(1, 10)).toBe(60 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(4, 10)).toBe(8 * 60 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(9, 10)).toBe(24 * 60 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(10, 10)).toBe(30 * 24 * 60 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(64, 10)).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('tracks a configured interval but never drops below the floor', () => {
      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = String(5 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(1, 10)).toBe(5 * 60 * 1000);
      expect(getConversationPurgeRetryDelay(3, 10)).toBe(20 * 60 * 1000);

      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '5';
      expect(getConversationPurgeRetryDelay(1, 10)).toBe(60 * 1000);
    });
  });

  describe('env-var getters', () => {
    it('falls back to defaults for unset or invalid values', () => {
      expect(getConversationPurgeSweepInterval(undefined)).toBe(60 * 60 * 1000);
      expect(getConversationPurgeSweepInterval('0.5')).toBe(60 * 60 * 1000);
      expect(getConversationPurgeBatchSize('not-a-number')).toBe(200);
      expect(getConversationPurgeMaxAttempts('-1')).toBe(10);
      expect(getConversationPurgeClaimLeaseMs('-1')).toBe(10 * 60 * 1000);
    });

    it('parses valid overrides', () => {
      expect(getConversationPurgeSweepInterval('5000')).toBe(5000);
      expect(getConversationPurgeBatchSize('25')).toBe(25);
      expect(getConversationPurgeMaxAttempts('3')).toBe(3);
      expect(getConversationPurgeClaimLeaseMs('60000')).toBe(60000);
    });
  });

  describe('startConversationPurgeSweep', () => {
    it('does not start the interval when the sweep is disabled', () => {
      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '0';

      const interval = startConversationPurgeSweep(
        {},
        {
          purgeExpiredConversations: jest.fn(),
          runAsSystem: jest.fn((fn) => fn()),
          isLeader: jest.fn().mockResolvedValue(true),
          logger,
        },
      );

      expect(interval).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        '[purgeExpiredConversations] Disabled by CONVERSATION_PURGE_SWEEP_INTERVAL_MS=0',
      );
    });

    it('runs the sweep only on the elected leader and permits follower takeover', async () => {
      jest.useFakeTimers();
      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '1000';
      const sweep = jest.fn().mockResolvedValue({ scanned: 0, purged: 0, failed: 0 });
      const runAsSystem = jest.fn((fn) => fn());
      const isLeader = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const interval = startConversationPurgeSweep(
        {},
        { purgeExpiredConversations: sweep, runAsSystem, isLeader, logger },
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(isLeader).toHaveBeenCalledTimes(1);
      expect(sweep).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);

      expect(isLeader).toHaveBeenCalledTimes(2);
      expect(runAsSystem).toHaveBeenCalledTimes(1);
      expect(sweep).toHaveBeenCalledTimes(1);
      clearInterval(interval ?? undefined);
    });

    it('does not overlap a slow sweep with the next interval', async () => {
      jest.useFakeTimers();
      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '1000';
      let finish!: () => void;
      const sweep = jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const isLeader = jest.fn().mockResolvedValue(true);
      const interval = startConversationPurgeSweep(
        {},
        { purgeExpiredConversations: sweep, isLeader, runAsSystem: (fn) => fn(), logger },
      );
      await jest.advanceTimersByTimeAsync(3000);
      expect(sweep).toHaveBeenCalledTimes(1);
      finish();
      await jest.advanceTimersByTimeAsync(1000);
      expect(sweep).toHaveBeenCalledTimes(2);
      finish();
      clearInterval(interval ?? undefined);
    });

    it('fails closed on leadership errors and retries on the next interval', async () => {
      jest.useFakeTimers();
      process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '1000';
      const sweep = jest.fn().mockResolvedValue({ scanned: 0, purged: 0, failed: 0 });
      const isLeader = jest
        .fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValue(true);
      const interval = startConversationPurgeSweep(
        {},
        { purgeExpiredConversations: sweep, isLeader, runAsSystem: (fn) => fn(), logger },
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(sweep).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(sweep).toHaveBeenCalledTimes(1);
      clearInterval(interval ?? undefined);
    });
  });
});
