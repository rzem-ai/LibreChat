import {
  scanSkillUpload,
  scanSkillFileUpload,
  isSkillScanError,
  type SkillScanError,
} from './scanner';

const ENV_KEYS = [
  'SKILL_SCANNER_URL',
  'SKILL_SCANNER_BEARER_TOKEN',
  'SKILL_SCANNER_TIMEOUT_MS',
  'SKILL_SCANNER_MIN_SEVERITY',
] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function nonJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
}

function upload(archive: Uint8Array = new Uint8Array([1, 2, 3])): Promise<void> {
  return scanSkillUpload({ archive, fileName: 'skill.zip' });
}

describe('skill scanner', () => {
  const originalFetch = global.fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.SKILL_SCANNER_URL = 'https://scanner.test/v1/scan';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('no-ops (fail-open) when SKILL_SCANNER_URL is unset', async () => {
    delete process.env.SKILL_SCANNER_URL;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(upload()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not block when validation.passed is false but problems is empty (scanner quirk)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: false, problems: [] },
        scan: { is_safe: true, findings: [] },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).resolves.toBeUndefined();
  });

  it('blocks and surfaces issues when validation.passed is false with problems', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: {
          passed: false,
          problems: ['Missing required field in frontmatter: name'],
        },
        scan: { is_safe: true, findings: [] },
      }),
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await upload();
    } catch (error) {
      caught = error;
    }

    expect(isSkillScanError(caught)).toBe(true);
    expect((caught as SkillScanError).statusCode).toBe(422);
    expect((caught as SkillScanError).issues).toEqual([
      { message: 'Missing required field in frontmatter: name' },
    ]);
  });

  it('does not block a finding below the configured severity threshold', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'high';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [{ severity: 'medium', description: 'minor issue', rule_id: 'R1' }],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).resolves.toBeUndefined();
  });

  it('blocks a finding at/above the configured severity threshold', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'high';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [
            { severity: 'critical', description: 'exec() call detected', rule_id: 'DANGEROUS_EXEC' },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      issues: [{ code: 'DANGEROUS_EXEC', severity: 'critical', message: 'exec() call detected' }],
    });
  });

  it('fails safe and blocks a finding with a missing severity, even under the most lenient threshold', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'critical';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [{ description: 'unclassified finding', rule_id: 'UNKNOWN_RULE' }],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({ statusCode: 422 });
  });

  it('fails safe and blocks a finding with an unrecognized severity label', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'critical';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [
            { severity: 'moderate', description: 'new severity label', rule_id: 'NEW_RULE' },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({ statusCode: 422 });
  });

  it('blocks with a generic message on a non-JSON error response', async () => {
    global.fetch = jest.fn().mockResolvedValue(nonJsonResponse(500)) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      message: 'Skill scan failed due to validation issues',
    });
  });

  it('blocks with a timeout-specific message when the request aborts', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      message: 'Skill scan timed out',
    });
  });

  it('blocks with a generic message on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      message: 'Skill scan request failed',
    });
  });

  it('skips manifest validation for single-file uploads (no SKILL.md manifest)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: false, problems: ['irrelevant, no manifest here'] },
        scan: { is_safe: true, findings: [] },
      }),
    ) as unknown as typeof fetch;

    await expect(
      scanSkillFileUpload({ fileName: 'script.sh', content: Buffer.from('echo hi') }),
    ).resolves.toBeUndefined();
  });
});
