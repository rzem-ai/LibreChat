/**
 * Research tool contract and configuration schema: names, argument schemas, the descriptions
 * the model sees, and the `researcher.yaml` levers. The tool runtime, the definitions the host's
 * tool registry receives and the config loader all read from here.
 */
import { z } from 'zod';

export const RESEARCH_TOOL_NAMES = {
  searchWeb: 'search_web',
  fetchPage: 'fetch_page',
  readDocument: 'read_document',
  searchUploads: 'search_uploads',
  readFeedItems: 'read_feed_items',
  recordFinding: 'record_finding',
  submitBrief: 'submit_brief',
  submitDraft: 'submit_draft',
} as const;

export type ResearchToolName = (typeof RESEARCH_TOOL_NAMES)[keyof typeof RESEARCH_TOOL_NAMES];

export const MAX_BRIEF_CHARS = 8_000;
export const MAX_DRAFT_CHARS = 400_000;

export const searchWebSchema: z.ZodObject<{
  query: z.ZodString;
  freshness: z.ZodOptional<z.ZodEnum<['day', 'week', 'month', 'year']>>;
}> = z.object({
  query: z.string().min(1).max(400).describe('The search query.'),
  freshness: z
    .enum(['day', 'week', 'month', 'year'])
    .optional()
    .describe('Only return results from this recent period.'),
});

export const fetchPageSchema: z.ZodObject<{ url: z.ZodString }> = z.object({
  url: z.string().url().describe('The http or https URL to fetch.'),
});

export const readDocumentSchema: z.ZodObject<{ reference: z.ZodString }> = z.object({
  reference: z.string().min(1).max(2000).describe('The document URL or path the user gave.'),
});

export const searchUploadsSchema: z.ZodObject<{ query: z.ZodString }> = z.object({
  query: z.string().min(1).max(400).describe('What to look for.'),
});

export const readFeedItemsSchema: z.ZodObject<{
  since_hours: z.ZodOptional<z.ZodNumber>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  since_hours: z
    .number()
    .int()
    .min(1)
    .max(45 * 24)
    .optional()
    .describe('Only items published in this many past hours. Defaults to 24.'),
  limit: z.number().int().min(1).max(500).optional().describe('Maximum items to return.'),
});

export const recordFindingSchema: z.ZodObject<{
  claim: z.ZodString;
  snapshot_id: z.ZodString;
  locator: z.ZodOptional<z.ZodString>;
}> = z.object({
  claim: z.string().min(1).max(1000).describe('One factual claim, in your own words.'),
  snapshot_id: z.string().min(1).max(64).describe('The snapshot the claim comes from.'),
  locator: z
    .string()
    .max(200)
    .optional()
    .describe('Section anchor, heading, page or a short quote locating the claim.'),
});

export const submitBriefSchema: z.ZodObject<{ brief: z.ZodString }> = z.object({
  brief: z.string().min(1).max(MAX_BRIEF_CHARS),
});

export const submitDraftSchema: z.ZodObject<{ markdown: z.ZodString }> = z.object({
  markdown: z.string().min(1).max(MAX_DRAFT_CHARS),
});

/**
 * What the model is told each research tool does. The runtime tools and the tool definitions
 * both read these and the schemas above, so what the model sees is what runs.
 */
export const RESEARCH_TOOL_DESCRIPTIONS: Record<ResearchToolName, string> = {
  search_web:
    'Search the web to discover pages. Results are for discovery only and cannot be cited; fetch a page to read and cite it.',
  fetch_page:
    'Fetch a web page, store it as a snapshot and return its snapshot_id and content. Only snapshot ids can be cited.',
  read_document:
    'Read a SharePoint or OneDrive document the user named, as the user, and store it as a snapshot. Returns the snapshot_id, section anchors and content.',
  search_uploads:
    'Search the files the user attached to this job. Each matching passage is stored as a snapshot and returned with its snapshot_id.',
  read_feed_items:
    "List recent items from the user's subscribed feeds, newest first, each with its snapshot_id, title, link, feed and an excerpt. Items are citable by snapshot_id.",
  record_finding:
    'Record one finding: a single factual claim, the snapshot_id it comes from, and where in the snapshot it appears. Only recorded findings can be cited in the report.',
  submit_brief:
    'Save the research brief: the question as understood, intended sources, output shape and exclusions.',
  submit_draft:
    'Save the full markdown report. Every factual sentence must end with its [[cite:<snapshot_id>]] marker.',
};

/** Argument schema per research tool; the tool definitions turn these into JSON Schema. */
export const RESEARCH_TOOL_SCHEMAS: Record<ResearchToolName, z.ZodTypeAny> = {
  search_web: searchWebSchema,
  fetch_page: fetchPageSchema,
  read_document: readDocumentSchema,
  search_uploads: searchUploadsSchema,
  read_feed_items: readFeedItemsSchema,
  record_finding: recordFindingSchema,
  submit_brief: submitBriefSchema,
  submit_draft: submitDraftSchema,
};

const NAMES = new Set<string>(Object.values(RESEARCH_TOOL_NAMES));

export function isResearchToolName(name: string): name is ResearchToolName {
  return NAMES.has(name);
}

/**
 * Where `search_web` gets results: `brave` calls the Brave Search API; `native` asks a model on
 * an Anthropic endpoint to run its built-in web search; `auto` picks `native` when the search
 * endpoint is `anthropic`, else `brave`.
 */
export const researchSearchProviders = ['auto', 'brave', 'native'] as const;
export type TResearchSearchProvider = (typeof researchSearchProviders)[number];

type TResearchJobBudgetConfig = { wallClockMinutes: number; maxSteps: number };

/** Parsed `researcher.yaml`: every lever is filled with its default. */
export type TResearchConfig = {
  enabled: boolean;
  agents: {
    provider?: string;
    model?: string;
    /** Author user id for the seeded agents; defaults to the first admin. */
    author?: string;
  };
  search: {
    provider: TResearchSearchProvider;
    braveApiKey: string;
    count: number;
    native: { endpoint?: string; model?: string };
  };
  fetch: {
    maxBytes: number;
    timeoutSeconds: number;
    maxRedirects: number;
    allowedAddresses?: string[];
  };
  documents: { mcpServer?: string; toolName?: string; argumentName: string };
  submitFetch: { maxDocuments: number; maxMinutes: number };
  jobs: {
    requirements: TResearchJobBudgetConfig;
    currentEvents: TResearchJobBudgetConfig;
    trends: TResearchJobBudgetConfig & { priorReports: number };
    digest: TResearchJobBudgetConfig & { maxItems: number };
    solution: TResearchJobBudgetConfig;
  };
  budgetDraftThreshold: number;
  maxConcurrentJobsPerUser: number;
  verification: { model?: string; maxClaims: number; maxAttempts: number };
  snapshots: { retentionDays: number; sweepHour: number };
  feeds: { pollIntervalMinutes: number; maxPerUser: number; disableAfterFailures: number };
  delivery: { email: boolean; teams: boolean; maxAttempts: number; retryBaseSeconds: number };
};

const researchJobBudgetSchema = (wallClockMinutes: number, maxSteps: number) =>
  z.object({
    wallClockMinutes: z.number().int().positive().default(wallClockMinutes),
    maxSteps: z.number().int().positive().default(maxSteps),
  });

/**
 * Research configuration, read from `researcher.yaml` (see `loadResearchConfig`). Every value
 * is an operator lever; defaults reproduce the design's behaviour.
 */
export const researchSchema: z.ZodType<TResearchConfig, z.ZodTypeDef, unknown> = z.object({
  enabled: z.boolean().default(false),
  agents: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      author: z.string().optional(),
    })
    .default({}),
  search: z
    .object({
      provider: z.enum(researchSearchProviders).default('auto'),
      braveApiKey: z.string().default('${BRAVE_API_KEY}'),
      /** Results requested per search_web call. */
      count: z.number().int().min(1).max(20).default(10),
      /** Built-in search; endpoint and model default to `agents.provider` and `agents.model`. */
      native: z
        .object({
          endpoint: z.string().optional(),
          model: z.string().optional(),
        })
        .default({}),
    })
    .default({}),
  /** Page fetches for snapshots go through the SSRF-guarded agent with these bounds. */
  fetch: z
    .object({
      maxBytes: z.number().int().positive().default(5_000_000),
      timeoutSeconds: z.number().int().positive().default(20),
      maxRedirects: z.number().int().min(0).max(10).default(5),
      /** Admin exemption list of host:port pairs the SSRF guard lets through. */
      allowedAddresses: z.array(z.string()).optional(),
    })
    .default({}),
  /** MCP gateway tool that returns a SharePoint or OneDrive document under on-behalf-of. */
  documents: z
    .object({
      mcpServer: z.string().optional(),
      toolName: z.string().optional(),
      /** Name of the tool argument that receives the document path or URL. */
      argumentName: z.string().default('reference'),
    })
    .default({}),
  submitFetch: z
    .object({
      maxDocuments: z.number().int().positive().default(25),
      maxMinutes: z.number().int().positive().default(10),
    })
    .default({}),
  jobs: z
    .object({
      requirements: researchJobBudgetSchema(45, 400).default({}),
      currentEvents: researchJobBudgetSchema(30, 300).default({}),
      trends: researchJobBudgetSchema(30, 300)
        /** Earlier delivered reports of the same schedule loaded as prior-report sources. */
        .extend({ priorReports: z.number().int().min(0).max(20).default(3) })
        .default({}),
      /** A broad digest spends about 40 steps a minute across its subagents, then needs a few
       *  minutes to draft and check; the clock leaves that room after the steps run out. */
      digest: researchJobBudgetSchema(15, 200)
        .extend({ maxItems: z.number().int().positive().default(200) })
        .default({}),
      solution: researchJobBudgetSchema(60, 500).default({}),
    })
    .default({}),
  /** Fraction of the wall-clock budget after which the job stops researching and drafts. */
  budgetDraftThreshold: z.number().gt(0).max(1).default(0.85),
  maxConcurrentJobsPerUser: z.number().int().positive().default(2),
  verification: z
    .object({
      model: z.string().optional(),
      maxClaims: z.number().int().positive().default(400),
      /** Failed verification or delivery attempts before the job fails as verification_failed. */
      maxAttempts: z.number().int().positive().max(50).default(5),
    })
    .default({}),
  snapshots: z
    .object({
      retentionDays: z.number().int().positive().default(45),
      sweepHour: z.number().int().min(0).max(23).default(3),
    })
    .default({}),
  feeds: z
    .object({
      pollIntervalMinutes: z.number().int().positive().default(30),
      maxPerUser: z.number().int().positive().default(100),
      disableAfterFailures: z.number().int().positive().default(10),
    })
    .default({}),
  delivery: z
    .object({
      email: z.boolean().default(true),
      teams: z.boolean().default(false),
      /** Send attempts per extra channel before it is marked failed. */
      maxAttempts: z.number().int().positive().max(20).default(5),
      /** First retry delay; each later retry doubles it, capped at a day. */
      retryBaseSeconds: z.number().int().positive().default(60),
    })
    .default({}),
});
