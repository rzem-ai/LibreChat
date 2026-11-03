import {
  isResearchToolName,
  RESEARCH_TOOL_NAMES,
  RESEARCH_TOOL_SCHEMAS,
  researchSchema,
  RESEARCH_TOOL_DESCRIPTIONS,
} from '../../src/contract/research';

describe('research tool contract', () => {
  it('describes every research tool and gives it an argument schema', () => {
    for (const name of Object.values(RESEARCH_TOOL_NAMES)) {
      expect(isResearchToolName(name)).toBe(true);
      expect(RESEARCH_TOOL_DESCRIPTIONS[name].length).toBeGreaterThan(20);
      expect(RESEARCH_TOOL_SCHEMAS[name].safeParse).toBeInstanceOf(Function);
    }
    expect(isResearchToolName('web_search')).toBe(false);
  });
});

describe('researchSchema', () => {
  it('fills every lever with the design defaults when given an empty object', () => {
    const parsed = researchSchema.parse({});
    expect(parsed.enabled).toBe(false);
    expect(parsed.search.braveApiKey).toBe('${BRAVE_API_KEY}');
    expect(parsed.submitFetch).toEqual({ maxDocuments: 25, maxMinutes: 10 });
    expect(parsed.jobs.requirements).toEqual({ wallClockMinutes: 45, maxSteps: 400 });
    expect(parsed.jobs.currentEvents).toEqual({ wallClockMinutes: 30, maxSteps: 300 });
    expect(parsed.jobs.trends).toEqual({ wallClockMinutes: 30, maxSteps: 300, priorReports: 3 });
    expect(parsed.jobs.digest).toEqual({ wallClockMinutes: 15, maxSteps: 200, maxItems: 200 });
    expect(parsed.jobs.solution).toEqual({ wallClockMinutes: 60, maxSteps: 500 });
    expect(parsed.budgetDraftThreshold).toBe(0.85);
    expect(parsed.maxConcurrentJobsPerUser).toBe(2);
    expect(parsed.verification.maxClaims).toBe(400);
    expect(parsed.snapshots).toEqual({ retentionDays: 45, sweepHour: 3 });
    expect(parsed.feeds).toEqual({
      pollIntervalMinutes: 30,
      maxPerUser: 100,
      disableAfterFailures: 10,
    });
    expect(parsed.delivery).toEqual({
      email: true,
      teams: false,
      maxAttempts: 5,
      retryBaseSeconds: 60,
    });
  });

  it('defaults the source levers added for the research tools', () => {
    const parsed = researchSchema.parse({});
    expect(parsed.search.count).toBe(10);
    expect(parsed.search.provider).toBe('auto');
    expect(parsed.search.native).toEqual({});
    expect(parsed.fetch).toEqual({ maxBytes: 5_000_000, timeoutSeconds: 20, maxRedirects: 5 });
    expect(parsed.fetch.allowedAddresses).toBeUndefined();
    expect(parsed.documents).toEqual({ argumentName: 'reference' });
  });

  it('accepts a document gateway server and tool', () => {
    const parsed = researchSchema.parse({
      documents: { mcpServer: 'm365-gateway', toolName: 'get_document' },
    });
    expect(parsed.documents).toEqual({
      mcpServer: 'm365-gateway',
      toolName: 'get_document',
      argumentName: 'reference',
    });
  });

  it('keeps operator overrides for a single job without losing the rest', () => {
    const parsed = researchSchema.parse({ jobs: { digest: { maxItems: 50 } } });
    expect(parsed.jobs.digest).toEqual({ wallClockMinutes: 15, maxSteps: 200, maxItems: 50 });
    expect(parsed.jobs.solution.maxSteps).toBe(500);
  });

  it('rejects a draft threshold outside (0, 1]', () => {
    expect(researchSchema.safeParse({ budgetDraftThreshold: 1.5 }).success).toBe(false);
    expect(researchSchema.safeParse({ budgetDraftThreshold: 0 }).success).toBe(false);
  });
});
