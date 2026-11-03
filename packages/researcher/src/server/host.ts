import { readScheduleFireContext } from '@librechat/api';
import { logger as defaultLogger, runAsSystem } from '@librechat/data-schemas';
import type { AgentTriggerEnvelope, EndpointDbMethods } from '@librechat/api';
import type { GenericTool } from '@librechat/agents';
import type {
  AdmissionResult,
  ResearchService,
  ResearchErrorCode,
  ResearchPrincipal,
} from './service';
import type { ResearchScheduleHandlers } from './schedules';
import type { ResearchHandlers } from './handlers';
import type { SnapshotStorage } from './snapshots';
import type { DeliveryChannel } from './channels';
import type { ResearchEmailDeps } from './email';
import type { ResearchHostMethods } from '../db';
import type { ReportStorage } from './delivery';
import type { McpCallTool } from './documents';
import type { NativeSearchInvoke } from './search';
import type { PhaseOutcome } from './phases';
import type { FeedHandlers } from './feeds';
import type { ResearchToolName } from '../contract/research';
import type { ResearchAppConfig } from './config';
import type { SeedResult } from './seed';
import { buildResearchToolDeps, createResearchFetcher } from './runtime';
import { createResearchService, researchPhaseKey } from './service';
import { createConversationReportDelivery } from './delivery';
import { createResearchScheduleHandlers } from './schedules';
import { researchJobTypeForAgent } from '../contract/types';
import { RESEARCH_TOOL_NAMES } from '../contract/research';
import { sweepSnapshots, isSweepDue } from './snapshots';
import { createModelClaimVerifier } from './verifier';
import { createNativeSearchInvoker, createResearchModelInvoker } from './model';
import { resolveSearch } from './search';
import { createSnapshotRecorder } from './snapshots';
import { createEmailDeliveryChannel } from './email';
import { createResearchHandlers } from './handlers';
import { createResearchTools } from './tools';
import { createFeedHandlers } from './feeds';
import { createFeedPoller } from './poller';
import { withResearchConfig } from './config';
import { seedResearchAgents } from './seed';

const DEFAULT_TICK_MS = 15_000;

const ADMISSION_STATUS: Record<ResearchErrorCode, number> = {
  research_disabled: 403,
  research_job_running: 409,
  research_concurrency_limit: 429,
  research_job_not_schedulable: 400,
};

const ADMISSION_MESSAGES: Record<ResearchErrorCode, string> = {
  research_disabled: 'Research agents are not enabled.',
  research_job_running: 'A research job is already running in this conversation.',
  research_concurrency_limit: 'You have reached the limit of research jobs running at once.',
  research_job_not_schedulable: 'This research job cannot run on a schedule.',
};

/**
 * Refusal of a research submission. Carries `status` and a stable `code`, which the chat
 * controller's initialization-failure path turns into a JSON response while releasing
 * the request's idempotency claim.
 */
export class ResearchAdmissionError extends Error {
  readonly status: number;
  readonly code: ResearchErrorCode;
  constructor(code: ResearchErrorCode) {
    super(ADMISSION_MESSAGES[code]);
    this.name = 'ResearchAdmissionError';
    this.code = code;
    this.status = ADMISSION_STATUS[code];
  }
}

/** Controller settlement statuses mapped onto phase outcomes. */
function phaseStatus(status: string): PhaseOutcome['status'] {
  if (status === 'success' || status === 'interrupted' || status === 'requires_action') {
    return status;
  }
  return 'error';
}

/** The parts of an agent chat request the research host reads. */
export type ResearchRequest = {
  user?: { id?: string; tenantId?: string; role?: string };
  config?: ResearchAppConfig;
  body: {
    agent_id?: string;
    text?: string;
    conversationId?: string;
    clientRequestId?: string;
    files?: Array<{ file_id?: string }>;
    /** Trusted trigger metadata; only read when `_isAgentTrigger` is set by the host. */
    agentTrigger?: unknown;
  };
  _isAgentTrigger?: boolean;
};

/** A generation's terminal outcome as the chat controller reports it. */
export type ResearchSettlement = {
  conversationId: string;
  /** Controller status: success, interrupted, requires_action, or any failure status. */
  status: string;
  responseMessageId?: string;
  responseText?: string;
  /** False when the request failed before its generation began. */
  started?: boolean;
};

export type ResearchHostDeps = {
  methods: ResearchHostMethods;
  /** Effective config for a principal; base config when called without one. */
  getAppConfig: (principal?: ResearchPrincipal) => Promise<ResearchAppConfig>;
  enqueueTrigger: (
    envelope: AgentTriggerEnvelope,
    options?: { orderingKey?: string },
  ) => Promise<unknown>;
  /** Snapshot storage for a file strategy source (local, s3, ...). */
  getStorage: (source: string) => SnapshotStorage;
  /** Report file storage for a file strategy source. */
  getReportStorage: (source: string) => ReportStorage;
  /** MCP caller bound to the live request, for the document gateway. */
  createMcpCaller?: (req: ResearchRequest) => McpCallTool | undefined;
  rag?: Parameters<typeof buildResearchToolDeps>[0]['rag'];
  endpointDb: EndpointDbMethods;
  /** Email delivery for scheduled reports; omitted when the deployment cannot send email. */
  email?: ResearchEmailDeps;
  /**
   * Unattended access to internal sources (design 5.9, phase 4). Install it only with a
   * host `HostUpstreamTokenProviderResolver` against the MCP gateway, a stored delegated
   * grant and a security review. When present, detached phases read named documents
   * through this caller, jobs 1 and 5 may be scheduled, and Teams delivery is offered.
   * The default application installs none.
   */
  delegatedAccess?: {
    /** MCP caller for a detached (trigger) request, backed by the token provider. */
    createMcpCaller: (req: ResearchRequest) => McpCallTool | undefined;
    /** Teams delivery through Graph via the gateway. */
    teams?: DeliveryChannel;
  };
  instanceId: string;
  isLeader?: () => Promise<boolean>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
};

function principalOf(req: ResearchRequest): ResearchPrincipal | undefined {
  const id = req.user?.id;
  if (!id) {
    return undefined;
  }
  return {
    id: String(id),
    ...(req.user?.tenantId ? { tenantId: req.user.tenantId } : {}),
    ...(req.user?.role ? { role: req.user.role } : {}),
  };
}

function sourceOf(appConfig: ResearchAppConfig | undefined): string {
  return (appConfig?.fileStrategy as string | undefined) ?? 'local';
}

export type ResearchHost = {
  service: ResearchService;
  admitRequest: (req: ResearchRequest, conversationId: string) => Promise<AdmissionResult>;
  /** Admits or throws `ResearchAdmissionError`; resolves quietly for non-research turns. */
  admitOrThrow: (req: ResearchRequest, conversationId: string) => Promise<void>;
  settleRequest: (req: ResearchRequest, outcome: ResearchSettlement) => Promise<void>;
  createTools: (req: ResearchRequest, signal?: AbortSignal) => Promise<GenericTool[]>;
  /**
   * One lazy constructor per research tool name, for the host's tool loader. The constructors
   * share a single `createTools` call per request.
   */
  toolConstructors: (
    req: ResearchRequest,
    signal?: AbortSignal,
  ) => Record<ResearchToolName, () => Promise<GenericTool | undefined>>;
  seed: () => Promise<SeedResult>;
  /** One job pass: phase supervision, verification, channel delivery and the nightly sweep. */
  backgroundPass: (now?: Date) => Promise<void>;
  /** One feed polling pass. */
  feedPass: () => Promise<void>;
  start: (options?: { tickMs?: number }) => () => void;
  handlers: ResearchHandlers;
  feedHandlers: FeedHandlers;
  scheduleHandlers: ResearchScheduleHandlers;
};

/**
 * Everything the app needs from the research module, built from host-supplied
 * functions: the service, request admission and settlement for the chat controller,
 * per-request tools, HTTP handlers, seeding, and the background worker and sweep.
 */
export function createResearchHost(deps: ResearchHostDeps): ResearchHost {
  const { methods } = deps;
  const log = deps.logger ?? defaultLogger;
  /** Host config with the research section from `researcher.yaml` attached. */
  const getAppConfig = async (principal?: ResearchPrincipal): Promise<ResearchAppConfig> =>
    withResearchConfig(await deps.getAppConfig(principal));

  const getConfig = async (principal: ResearchPrincipal) =>
    (await getAppConfig(principal))?.research;

  const service = createResearchService({
    methods,
    getConfig,
    enqueueTrigger: deps.enqueueTrigger,
    verifier: async (owner) => {
      const appConfig = await getAppConfig(owner);
      const config = appConfig.research;
      const endpoint = config?.agents.provider;
      const model = config?.verification.model ?? config?.agents.model;
      if (!endpoint || !model) {
        throw new Error(
          '[research] research.agents.provider and a verification model are required',
        );
      }
      return createModelClaimVerifier({
        invoke: createResearchModelInvoker({
          appConfig,
          user: { id: owner.id, tenantId: owner.tenantId, role: owner.role },
          endpoint,
          model,
          db: deps.endpointDb,
        }),
      });
    },
    reader: {
      read: (snapshot, signal) => deps.getStorage(snapshot.fileStrategy).read(snapshot, signal),
    },
    deliverReport: async (input) => {
      const appConfig = await getAppConfig({
        id: String(input.job.user),
        ...(input.job.tenantId ? { tenantId: input.job.tenantId } : {}),
      });
      return createConversationReportDelivery({
        methods,
        storage: deps.getReportStorage(sourceOf(appConfig)),
      })(input);
    },
    recordReportSnapshot: async ({ job, title, markdown }) => {
      const appConfig = await getAppConfig({
        id: String(job.user),
        ...(job.tenantId ? { tenantId: job.tenantId } : {}),
      });
      const snapshot = await createSnapshotRecorder({
        methods,
        storage: deps.getStorage(sourceOf(appConfig)),
      }).record({
        userId: String(job.user),
        ...(job.tenantId ? { tenantId: job.tenantId } : {}),
        sourceKind: 'priorReport',
        reference: `report:${job.id}`,
        stableReference: true,
        title,
        markdown,
      });
      return { snapshotId: snapshot.id };
    },
    channels: [
      ...(deps.email
        ? [
            createEmailDeliveryChannel({
              ...deps.email,
              getUser: (userId) => methods.getUserById(userId, 'email emailVerified name username'),
            }),
          ]
        : []),
      ...(deps.delegatedAccess?.teams ? [deps.delegatedAccess.teams] : []),
    ],
    delegatedDocuments: deps.delegatedAccess != null,
    instanceId: deps.instanceId,
    logger: log,
  });

  /** Opens a job for a user's turn to a research agent; null for anything else. */
  async function admitRequest(
    req: ResearchRequest,
    conversationId: string,
  ): Promise<AdmissionResult> {
    if (!researchJobTypeForAgent(req.body.agent_id)) {
      return null;
    }
    const principal = principalOf(req);
    if (!principal) {
      return null;
    }
    if (req._isAgentTrigger) {
      return admitScheduleFire(req, principal, conversationId);
    }
    const requested = (req.body.files ?? [])
      .map((file) => file?.file_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const owned =
      requested.length > 0
        ? ((await methods.getFiles({ file_id: { $in: requested }, user: principal.id })) ?? []).map(
            (file) => file.file_id,
          )
        : [];
    return service.admitSubmission({
      principal,
      agentId: String(req.body.agent_id),
      conversationId,
      prompt: req.body.text ?? '',
      phaseKey: researchPhaseKey(req.body.clientRequestId, conversationId),
      uploadFileIds: owned,
    });
  }

  /**
   * A schedule occurrence for a research agent opens a delegated job (design 5.7). Phase
   * continuations are triggers too, but carry no schedule context and open nothing.
   */
  async function admitScheduleFire(
    req: ResearchRequest,
    principal: ResearchPrincipal,
    conversationId: string,
  ): Promise<AdmissionResult> {
    const fire = readScheduleFireContext({
      _isAgentTrigger: req._isAgentTrigger,
      body: req.body as Record<string, unknown>,
    });
    if (!fire) {
      return null;
    }
    return service.admitSubmission({
      principal,
      agentId: String(req.body.agent_id),
      conversationId,
      prompt: req.body.text ?? '',
      phaseKey: researchPhaseKey(req.body.clientRequestId, conversationId),
      invocationMode: 'delegated',
      scheduleId: fire.scheduleId,
    });
  }

  async function admitOrThrow(req: ResearchRequest, conversationId: string): Promise<void> {
    const result = await admitRequest(req, conversationId);
    if (result && !result.ok) {
      throw new ResearchAdmissionError(result.error.code);
    }
  }

  /** Called at every terminal point of a generation; cheap no-op unless research. */
  async function settleRequest(req: ResearchRequest, outcome: ResearchSettlement): Promise<void> {
    const isResearchTurn = researchJobTypeForAgent(req.body.agent_id) != null;
    if (!req._isAgentTrigger && !isResearchTurn) {
      return;
    }
    /**
     * A phase trigger refused before its generation began (for example by the predecessor
     * fence while the previous phase is still finishing) is redelivered by the trigger
     * queue, so it must not settle the phase. If redelivery never succeeds, the deadline
     * watchdog delivers what the job has.
     */
    if (req._isAgentTrigger && outcome.started === false) {
      return;
    }
    const principal = principalOf(req);
    if (!principal) {
      return;
    }
    const clientRequestId = req._isAgentTrigger
      ? String(req.body.clientRequestId ?? '')
      : researchPhaseKey(req.body.clientRequestId, outcome.conversationId);
    try {
      await service.settlePhase({
        conversationId: outcome.conversationId,
        status: phaseStatus(outcome.status),
        ...(outcome.responseMessageId ? { responseMessageId: outcome.responseMessageId } : {}),
        ...(outcome.responseText ? { responseText: outcome.responseText } : {}),
        principal,
        clientRequestId,
      });
    } catch (error) {
      log.error('[research] Failed to settle a research phase', error);
    }
  }

  /** The request's own config when it carries one, else the principal's. */
  async function requestConfig(
    req: ResearchRequest,
    principal: ResearchPrincipal | undefined,
  ): Promise<ResearchAppConfig | undefined> {
    if (req.config) {
      return withResearchConfig(req.config);
    }
    return principal ? getAppConfig(principal) : undefined;
  }

  /** The research tools for one request, or none when research is off for the caller. */
  async function createTools(req: ResearchRequest, signal?: AbortSignal): Promise<GenericTool[]> {
    const principal = principalOf(req);
    const appConfig = await requestConfig(req, principal);
    const config = appConfig?.research;
    if (!principal || !config?.enabled || !req.body.conversationId) {
      return [];
    }
    const isLiveRequest = req._isAgentTrigger !== true;
    return createResearchTools(
      {
        userId: principal.id,
        ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        conversationId: req.body.conversationId,
        isLiveRequest,
        ...(signal ? { signal } : {}),
      },
      buildResearchToolDeps({
        config,
        methods,
        storage: deps.getStorage(sourceOf(appConfig)),
        callMcpTool: isLiveRequest
          ? deps.createMcpCaller?.(req)
          : deps.delegatedAccess?.createMcpCaller(req),
        rag: deps.rag,
        detachedDocuments: deps.delegatedAccess != null,
        nativeSearch: nativeSearchFor(appConfig, principal),
      }),
    );
  }

  /** The built-in search call for the job's owner, when `research.search` resolves to it. */
  function nativeSearchFor(
    appConfig: ResearchAppConfig | undefined,
    principal: ResearchPrincipal,
  ): NativeSearchInvoke | undefined {
    const research = appConfig?.research;
    const resolved = research ? resolveSearch(research) : undefined;
    if (!appConfig || resolved?.provider !== 'native' || !resolved.model) {
      return undefined;
    }
    return createNativeSearchInvoker({
      appConfig,
      user: { id: principal.id, tenantId: principal.tenantId, role: principal.role },
      endpoint: resolved.endpoint,
      model: resolved.model,
      db: deps.endpointDb,
    });
  }

  function toolConstructors(
    req: ResearchRequest,
    signal?: AbortSignal,
  ): Record<ResearchToolName, () => Promise<GenericTool | undefined>> {
    let tools: Promise<GenericTool[]> | undefined;
    const construct = (name: ResearchToolName) => async () => {
      tools ??= createTools(req, signal);
      return (await tools).find((candidate) => candidate.name === name);
    };
    return Object.fromEntries(
      Object.values(RESEARCH_TOOL_NAMES).map((name) => [name, construct(name)]),
    ) as Record<ResearchToolName, () => Promise<GenericTool | undefined>>;
  }

  /** Seeds the agents after creating research and feed indexes, which autoIndex-off deployments need. */
  async function seed() {
    const base = await getAppConfig();
    await runAsSystem(async () => {
      await methods.ensureResearchIndexes();
      await methods.ensureFeedIndexes();
    });
    return runAsSystem(() =>
      seedResearchAgents({
        methods,
        config: base?.research,
        maxRecursionLimit: base?.endpoints?.agents?.maxRecursionLimit,
        logger: log,
      }),
    );
  }

  const DAY_MS = 24 * 3_600_000;
  let lastSweepDay: string | undefined;

  async function sweep(base: ResearchAppConfig, now: Date): Promise<void> {
    const research = base.research;
    if (!research) {
      return;
    }
    const { sweepHour, retentionDays } = research.snapshots;
    if (!isSweepDue(now, sweepHour, lastSweepDay) || !(await (deps.isLeader?.() ?? true))) {
      return;
    }
    lastSweepDay = now.toISOString().slice(0, 10);
    await runAsSystem(async () => {
      await sweepSnapshots({
        methods,
        storage: {
          save: () => Promise.reject(new Error('sweep storage is read-only')),
          read: async () => null,
          remove: (snapshot) => deps.getStorage(snapshot.fileStrategy).remove(snapshot),
        },
        retentionDays,
        now,
        logger: log,
      });
      const expired = await methods.deleteExpiredFeedItems(
        new Date(now.getTime() - retentionDays * DAY_MS),
      );
      if (expired > 0) {
        log.info(`[research] Expired ${expired} unarchived feed items`);
      }
    });
  }

  async function pollFeeds(base: ResearchAppConfig): Promise<void> {
    const research = base.research;
    if (!research) {
      return;
    }
    await createFeedPoller({
      methods,
      getConfig: async () => research,
      fetcher: createResearchFetcher(research),
      recorder: createSnapshotRecorder({ methods, storage: deps.getStorage(sourceOf(base)) }),
      instanceId: deps.instanceId,
      logger: log,
    }).pollOnce();
  }

  /** Job work: phase supervision, verification, channel delivery, then the nightly sweep. */
  async function backgroundPass(now: Date = new Date()): Promise<void> {
    const base = await getAppConfig();
    if (!base?.research?.enabled) {
      return;
    }
    try {
      await service.tick();
    } catch (error) {
      log.error('[research] Worker tick failed', error);
    }
    await sweep(base, now);
  }

  /** Feed polling, on its own loop so a slow feed never delays job work. */
  async function feedPass(): Promise<void> {
    const base = await getAppConfig();
    if (!base?.research?.enabled) {
      return;
    }
    await pollFeeds(base);
  }

  /** Runs `pass` every `ms`, skipping a beat while the previous run is still going. */
  function loop(pass: () => Promise<void>, ms: number, label: string): () => void {
    let running = false;
    const run = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        await pass();
      } catch (error) {
        log.error(`[research] ${label} failed`, error);
      } finally {
        running = false;
      }
    };
    const interval = setInterval(() => void run(), ms);
    interval.unref?.();
    return () => clearInterval(interval);
  }

  /** Starts the job loop and the feed loop independently; returns a stop function. */
  function start(options: { tickMs?: number } = {}): () => void {
    const ms = options.tickMs ?? DEFAULT_TICK_MS;
    const stops = [
      loop(() => backgroundPass(), ms, 'Worker pass'),
      loop(feedPass, ms, 'Feed poll'),
    ];
    return () => stops.forEach((stop) => stop());
  }

  return {
    service,
    admitRequest,
    admitOrThrow,
    settleRequest,
    createTools,
    toolConstructors,
    seed,
    backgroundPass,
    feedPass,
    start,
    handlers: createResearchHandlers({ service }),
    feedHandlers: createFeedHandlers({ methods }),
    scheduleHandlers: createResearchScheduleHandlers({
      methods,
      emailAvailable: () => deps.email != null,
      delegatedDocuments: deps.delegatedAccess != null,
      teamsAvailable: () => deps.delegatedAccess?.teams != null,
    }),
  };
}
