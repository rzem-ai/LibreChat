import JSZip from 'jszip';
import {
  scanSkillUpload,
  scanSkillMarkdown,
  scanSkillFileUpload,
  isSkillScanError,
  type SkillScanError,
} from './scanner';

const ENV_KEYS = [
  'SKILL_SCANNER_URL',
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
            {
              severity: 'critical',
              description: 'exec() call detected',
              rule_id: 'DANGEROUS_EXEC',
            },
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

  it('surfaces the scanner-provided reason for a flat { detail } rejection (e.g. its zip-bomb guard)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { detail: "Archive entry 'SKILL.md' has a suspicious compression ratio (>100x)" },
          422,
        ),
      ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      issues: [{ message: "Archive entry 'SKILL.md' has a suspicious compression ratio (>100x)" }],
    });
  });

  it('blocks a 2xx response with a non-JSON (or empty) body instead of failing open', async () => {
    global.fetch = jest.fn().mockResolvedValue(nonJsonResponse(200)) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      message: 'Skill scan returned an invalid response',
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
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

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

  describe('Authorization header', () => {
    function passingResponse(): Response {
      return jsonResponse({
        validation: { passed: true, problems: [] },
        scan: { is_safe: true, findings: [] },
      });
    }

    it('omits Authorization when no token param is set', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await upload();

      const [, init] = fetchSpy.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('uses the OBO-derived token param when present', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await scanSkillUpload({
        archive: new Uint8Array([1, 2, 3]),
        fileName: 'skill.zip',
        token: 'obo-token',
      });

      const [, init] = fetchSpy.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer obo-token');
    });
  });

  describe('LibreChat-internal frontmatter fields on upload', () => {
    function passingResponse(): Response {
      return jsonResponse({
        validation: { passed: true, problems: [] },
        scan: { is_safe: true, findings: [] },
      });
    }

    async function scannedArchiveFrom(call: unknown[]): Promise<JSZip> {
      const [, init] = call as [string, { body: FormData }];
      const blob = init.body.get('file') as unknown as Blob;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return JSZip.loadAsync(buffer);
    }

    it('strips always-apply out of a markdown upload before the manifest scan, and re-submits it separately', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const content = [
        '---',
        'name: fixture-skill',
        'description: A fixture that always applies.',
        'always-apply: true',
        '---',
        '',
        '# Body',
      ].join('\n');

      await scanSkillMarkdown({ content, fileName: 'skill.zip' });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const manifestZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const manifestSkillMd = await manifestZip.file('SKILL.md')?.async('string');
      expect(manifestSkillMd).not.toMatch(/^always-apply\s*:/im);
      expect(manifestSkillMd).toContain('name:');
      expect(manifestSkillMd).toContain('description:');

      const frontmatterZip = await scannedArchiveFrom(fetchSpy.mock.calls[1]);
      const frontmatterFile = Object.keys(frontmatterZip.files)[0];
      const frontmatterText = await frontmatterZip.file(frontmatterFile)?.async('string');
      expect(frontmatterText).toMatch(/alwaysApply/);
    });

    it('strips always-apply out of a zip upload while preserving companion files', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const zip = new JSZip();
      zip.file(
        'SKILL.md',
        [
          '---',
          'name: fixture-skill',
          'description: A fixture that always applies.',
          'always-apply: true',
          '---',
          '',
          '# Body',
        ].join('\n'),
      );
      zip.file('scripts/helper.py', 'print("hello")\n');
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill.zip' });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const manifestZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const manifestSkillMd = await manifestZip.file('SKILL.md')?.async('string');
      expect(manifestSkillMd).not.toMatch(/^always-apply\s*:/im);
      const companionFile = await manifestZip.file('scripts/helper.py')?.async('string');
      expect(companionFile).toBe('print("hello")\n');

      const frontmatterZip = await scannedArchiveFrom(fetchSpy.mock.calls[1]);
      const frontmatterFile = Object.keys(frontmatterZip.files)[0];
      const frontmatterText = await frontmatterZip.file(frontmatterFile)?.async('string');
      expect(frontmatterText).toMatch(/alwaysApply/);
    });

    it('falls back to scanning the raw archive when SKILL.md has invalid YAML frontmatter', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const zip = new JSZip();
      zip.file('SKILL.md', ['---', 'name: [unterminated', '---', '', '# Body'].join('\n'));
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill.zip' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const scannedZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const scannedSkillMd = await scannedZip.file('SKILL.md')?.async('string');
      expect(scannedSkillMd).toContain('name: [unterminated');
    });
  });
});
