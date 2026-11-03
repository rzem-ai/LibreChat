import { logger } from '@librechat/data-schemas';
import type { ISchedule } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type {
  ResearchJobType,
  TResearchSchedule,
  ResearchDeliveryChannel,
} from '../contract/types';
import type { TResearchConfig } from '../contract/research';
import type { ResearchHostMethods } from '../db';
import { getResearchConfig } from './config';
import { researchJobTypeForAgent, SCHEDULABLE_RESEARCH_JOB_TYPES } from '../contract/types';

type ScheduleRequest = Request & {
  user?: { id?: string; tenantId?: string };
  config?: { research?: TResearchConfig };
};

export type ResearchScheduleHandlerMethods = Pick<
  ResearchHostMethods,
  | 'getSchedulesByUser'
  | 'getScheduleById'
  | 'getResearchSchedule'
  | 'listResearchSchedules'
  | 'upsertResearchSchedule'
  | 'deleteResearchSchedule'
>;

export type ResearchScheduleHandlers = {
  listSchedules: (req: Request, res: Response) => Promise<void>;
  updateSchedule: (req: Request, res: Response) => Promise<void>;
  resetSchedule: (req: Request, res: Response) => Promise<void>;
};

const SENDABLE: ReadonlyArray<Exclude<ResearchDeliveryChannel, 'conversation'>> = [
  'email',
  'teams',
];

/**
 * HTTP handlers for research delivery settings on the caller's schedules (design 5.7,
 * 5.8). The upstream Schedule row and dialog are untouched; settings live in a
 * research-owned row keyed by schedule id, and a schedule without one delivers to its
 * conversation only.
 */
export function createResearchScheduleHandlers(deps: {
  methods: ResearchScheduleHandlerMethods;
  /** Whether the host can send email at all (a provider is configured). */
  emailAvailable: () => boolean;
  /** A gateway token provider is installed: jobs 1 and 5 may be scheduled (design 5.9). */
  delegatedDocuments?: boolean;
  /** A Teams channel is installed; it ships only with the token provider (design 5.8). */
  teamsAvailable?: () => boolean;
}): ResearchScheduleHandlers {
  const { methods } = deps;
  const installed: Record<(typeof SENDABLE)[number], () => boolean> = {
    email: deps.emailAvailable,
    teams: deps.teamsAvailable ?? (() => false),
  };

  function scheduledJobType(schedule: ISchedule | null): ResearchJobType | undefined {
    const jobType = schedule ? researchJobTypeForAgent(schedule.agent_id) : undefined;
    if (!jobType) {
      return undefined;
    }
    return deps.delegatedDocuments || SCHEDULABLE_RESEARCH_JOB_TYPES.includes(jobType)
      ? jobType
      : undefined;
  }

  function availableChannels(config: TResearchConfig): ResearchDeliveryChannel[] {
    return [
      'conversation',
      ...SENDABLE.filter((channel) => config.delivery[channel] === true && installed[channel]()),
    ];
  }

  function guarded(
    context: string,
    handler: (
      req: ScheduleRequest,
      res: Response,
      config: TResearchConfig,
      userId: string,
    ) => Promise<void>,
  ): (req: Request, res: Response) => Promise<void> {
    return async (req, res) => {
      const request = req as ScheduleRequest;
      const config = request.config?.research ?? getResearchConfig();
      const userId = request.user?.id;
      if (!config?.enabled || !userId) {
        res.status(403).json({ error_code: 'research_disabled' });
        return;
      }
      try {
        await handler(request, res, config, String(userId));
      } catch (error) {
        logger.error(`[research] ${context}`, error);
        res.status(500).json({ error_code: 'research_unavailable' });
      }
    };
  }

  function toResponse(
    schedule: ISchedule,
    jobType: ResearchJobType,
    channels: ResearchDeliveryChannel[] | undefined,
    available: ResearchDeliveryChannel[],
  ): TResearchSchedule {
    return {
      scheduleId: schedule.id,
      name: schedule.name,
      agentId: schedule.agent_id,
      jobType,
      enabled: schedule.enabled === true,
      channels: channels?.length ? channels : ['conversation'],
      availableChannels: available,
    };
  }

  /** The caller's own schedule whose agent is a schedulable research agent. */
  async function ownResearchSchedule(scheduleId: string, userId: string) {
    const schedule = await methods.getScheduleById(scheduleId, userId);
    const jobType = scheduledJobType(schedule);
    return schedule && jobType ? { schedule, jobType } : null;
  }

  const listSchedules = guarded(
    'Failed to list research schedules',
    async (_req, res, config, userId) => {
      const [schedules, settings] = await Promise.all([
        methods.getSchedulesByUser(userId),
        methods.listResearchSchedules(userId),
      ]);
      const channelsById = new Map(settings.map((s) => [s.scheduleId, s.channels]));
      const available = availableChannels(config);
      res.json({
        schedules: schedules.flatMap((schedule) => {
          const jobType = scheduledJobType(schedule);
          return jobType
            ? [toResponse(schedule, jobType, channelsById.get(schedule.id), available)]
            : [];
        }),
      });
    },
  );

  const updateSchedule = guarded(
    'Failed to update a research schedule',
    async (req, res, config, userId) => {
      const scheduleId = String(req.params.scheduleId);
      const requested = (req.body as { channels?: unknown } | undefined)?.channels;
      const available = availableChannels(config);
      if (
        !Array.isArray(requested) ||
        requested.some(
          (channel) =>
            typeof channel !== 'string' || !available.includes(channel as ResearchDeliveryChannel),
        )
      ) {
        res.status(400).json({ error_code: 'research_channel_unavailable' });
        return;
      }
      const owned = await ownResearchSchedule(scheduleId, userId);
      if (!owned) {
        res.status(404).json({ error_code: 'research_schedule_not_found' });
        return;
      }
      const channels: ResearchDeliveryChannel[] = [
        'conversation',
        ...available.filter((c) => c !== 'conversation' && requested.includes(c)),
      ];
      const saved = await methods.upsertResearchSchedule({
        scheduleId,
        user: userId,
        jobType: owned.jobType,
        channels,
        ...(req.user?.tenantId ? { tenantId: req.user.tenantId } : {}),
      });
      if (!saved) {
        res.status(404).json({ error_code: 'research_schedule_not_found' });
        return;
      }
      res.json(toResponse(owned.schedule, owned.jobType, saved.channels, available));
    },
  );

  const resetSchedule = guarded(
    'Failed to reset a research schedule',
    async (req, res, config, userId) => {
      const scheduleId = String(req.params.scheduleId);
      const owned = await ownResearchSchedule(scheduleId, userId);
      if (!owned) {
        res.status(404).json({ error_code: 'research_schedule_not_found' });
        return;
      }
      await methods.deleteResearchSchedule(scheduleId, userId);
      res.json(toResponse(owned.schedule, owned.jobType, undefined, availableChannels(config)));
    },
  );

  return { listSchedules, updateSchedule, resetSchedule };
}
