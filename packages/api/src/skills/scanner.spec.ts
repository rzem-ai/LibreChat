import JSZip from 'jszip';
import {
  scanSkillOnCreate,
  scanSkillOnUpdate,
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

  it('blocks with a generic message when validation.passed is false but problems is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: false, problems: [] },
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
      { message: 'Skill scan failed due to validation issues' },
    ]);
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

  it('prefers the finding user_message over description when both are present', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'high';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [
            {
              severity: 'critical',
              description: 'Pattern detected: exec(',
              rule_id: 'COMMAND_INJECTION_EVAL',
              user_message: 'Critical — Command Injection Eval: Pattern detected: exec(',
            },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      issues: [
        {
          code: 'COMMAND_INJECTION_EVAL',
          severity: 'critical',
          message: 'Critical — Command Injection Eval: Pattern detected: exec(',
          friendly: true,
        },
      ],
    });
  });

  it('does not mark a finding as friendly when it has no user_message (falls back to description)', async () => {
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
      issues: [
        {
          code: 'DANGEROUS_EXEC',
          severity: 'critical',
          message: 'exec() call detected',
          friendly: false,
        },
      ],
    });
  });

  it('falls back when user_message or description is an empty string', async () => {
    process.env.SKILL_SCANNER_MIN_SEVERITY = 'high';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: {
          is_safe: true,
          findings: [
            {
              severity: 'critical',
              description: '',
              rule_id: 'BLANK_MESSAGE',
              user_message: '',
            },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({
      statusCode: 422,
      issues: [
        {
          code: 'BLANK_MESSAGE',
          severity: 'critical',
          message: 'Skill scan found an issue',
          friendly: false,
        },
      ],
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

  // Deloitte Custom Change: Verify security-only scans omit manifest validation noise from failures.
  it('does not surface manifest validation problems as the reason a requireValidation:false scan failed', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: false, problems: ['Missing required file: SKILL.md'] },
        scan: { is_safe: false, findings: [] },
      }),
    ) as unknown as typeof fetch;

    await expect(
      scanSkillFileUpload({ fileName: 'script.sh', content: Buffer.from('echo hi') }),
    ).rejects.toMatchObject({
      statusCode: 422,
      issues: [{ message: 'Skill scan failed' }],
    });
  });

  // Deloitte Custom Change: Verify manifest-less scans can pass when the scanner returns no verdict.
  it('does not block a requireValidation:false scan when the scanner returns scan: null (no manifest to evaluate)', async () => {
    // Mirrors the real scanner's response to a manifest-less archive: it
    // reports the manifest is missing but declines to run a security scan
    // at all, rather than reporting an unsafe verdict.
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        request_id: '0b24cd759bec4c71850fe5b398cb6653',
        validation: { passed: false, problems: ['Missing required file: SKILL.md'] },
        scan: null,
        risk_classification: null,
        verbose: null,
      }),
    ) as unknown as typeof fetch;

    await expect(
      scanSkillFileUpload({ fileName: 'script.sh', content: Buffer.from('echo hi') }),
    ).resolves.toBeUndefined();
  });

  // Deloitte Custom Change: Verify unsafe verdicts still block security-only scans.
  it('still blocks a requireValidation:false scan when the scanner does return an unsafe verdict', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: false, problems: ['Missing required file: SKILL.md'] },
        scan: {
          is_safe: false,
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

    await expect(
      scanSkillFileUpload({ fileName: 'script.sh', content: Buffer.from('echo hi') }),
    ).rejects.toMatchObject({
      statusCode: 422,
      issues: [{ code: 'DANGEROUS_EXEC', severity: 'critical', message: 'exec() call detected' }],
    });
  });

  // Deloitte Custom Change: Verify manifest-required scans still require an explicit safe verdict.
  it('still blocks a requireValidation:true scan when the scanner returns scan: null', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        validation: { passed: true, problems: [] },
        scan: null,
      }),
    ) as unknown as typeof fetch;

    await expect(upload()).rejects.toMatchObject({ statusCode: 422 });
  });

  // Deloitte Custom Change: Cover frontmatter-only scanner pass behavior for create and update flows.
  describe('scanSkillOnCreate / scanSkillOnUpdate frontmatter scanning', () => {
    function passingResponse(): Response {
      return jsonResponse({
        validation: { passed: true, problems: [] },
        scan: { is_safe: true, findings: [] },
      });
    }

    // Deloitte Custom Change: Verify manifest-owned fields do not trigger an extra scan.
    it('runs a single scan (no frontmatter-only pass) when there is no frontmatter beyond name/description', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await scanSkillOnUpdate({
        name: 'demo-skill',
        description: 'A demo skill',
        body: 'Do the thing.',
        frontmatter: { name: 'demo-skill', description: 'A demo skill' },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Deloitte Custom Change: Verify missing optional frontmatter does not trigger an extra scan.
    it('runs a single scan when frontmatter is undefined and alwaysApply is undefined', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await scanSkillOnCreate({
        name: 'demo-skill',
        description: 'A demo skill',
        body: 'Do the thing.',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Deloitte Custom Change: Verify extra frontmatter fields are scanned separately.
    it('runs a second frontmatter-only scan when frontmatter has fields beyond name/description', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await scanSkillOnUpdate({
        name: 'demo-skill',
        description: 'A demo skill',
        body: 'Do the thing.',
        frontmatter: { name: 'demo-skill', description: 'A demo skill', 'allowed-tools': ['bash'] },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    // Deloitte Custom Change: Verify explicit alwaysApply values are scanned separately.
    it('runs a second frontmatter-only scan when alwaysApply is explicitly set, even with no extra frontmatter fields', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      await scanSkillOnCreate({
        name: 'demo-skill',
        description: 'A demo skill',
        body: 'Do the thing.',
        alwaysApply: true,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
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

    // Deloitte Custom Change: Verify hidden files and artifact directories are stripped
    // before scanning by stripZipArtifacts, without removing valid underscore-prefixed
    // Python modules.
    it('strips hidden files and artifact directories before scanning', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      // Level 3 skill with macOS Finder artifacts injected by right-click → Compress
      const zip = new JSZip();
      zip.file(
        'skill-name/SKILL.md',
        ['---', 'name: mac-skill', 'description: A macOS-created skill.', '---', '# Body'].join(
          '\n',
        ),
      );
      zip.file('skill-name/FORMS.md', '# Form-filling guide');
      zip.file('skill-name/scripts/fill_form.py', 'print("hello")');
      zip.file('skill-name/scripts/_helpers.py', 'def helper(): pass');
      zip.file('skill-name/scripts/__init__.py', '');
      zip.file('skill-name/references/api-schema.json', '{"api": "schema"}');
      zip.file('skill-name/assets/template.txt', 'template');
      // Hidden files at multiple depths
      zip.file('skill-name/.DS_Store', '');
      zip.file('skill-name/scripts/.DS_Store', '');
      zip.file('.DS_Store', '');
      zip.file('skill-name/.env', 'SECRET=value');
      zip.file('skill-name/.gitignore', '.venv/');
      // __MACOSX/ mirror — Finder injects one sidecar per file with extended attributes
      zip.file('__MACOSX/skill-name/._SKILL.md', '');
      zip.file('__MACOSX/skill-name/._FORMS.md', '');
      zip.file('__MACOSX/skill-name/scripts/._fill_form.py', '');
      zip.file('__MACOSX/skill-name/references/._api-schema.json', '');
      zip.file('__MACOSX/skill-name/assets/._template.txt', '');
      // Accidental dependency and source-control directories nested under the skill root
      zip.file('skill-name/.venv/bin/python', '');
      zip.file('skill-name/scripts/__pycache__/fill_form.cpython-311.pyc', '');
      zip.file('skill-name/assets/node_modules/lodash/index.js', '');
      zip.file('skill-name/references/.git/config', '');
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill-name.zip' });

      // Inspect what the scanner actually received
      const scannedZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const scannedEntries = Object.keys(scannedZip.files);

      // Real skill files must be present — stripInternalFrontmatterFromZip re-roots
      // the archive by stripping the skill-name/ prefix before sending to the scanner
      expect(scannedEntries).toContain('SKILL.md');
      expect(scannedEntries).toContain('FORMS.md');
      expect(scannedEntries).toContain('scripts/fill_form.py');
      expect(scannedEntries).toContain('scripts/_helpers.py');
      expect(scannedEntries).toContain('scripts/__init__.py');
      expect(scannedEntries).toContain('references/api-schema.json');
      expect(scannedEntries).toContain('assets/template.txt');

      // No hidden files or configured artifact directories reach the scanner
      expect(
        scannedEntries.some((e) => e.split('/').some((segment) => segment.startsWith('.'))),
      ).toBe(false);
      expect(scannedEntries.some((e) => e.split('/').includes('__MACOSX'))).toBe(false);
      expect(scannedEntries.some((e) => e.split('/').includes('__pycache__'))).toBe(false);
      expect(scannedEntries.some((e) => e.split('/').includes('node_modules'))).toBe(false);
      expect(scannedEntries.some((e) => (e.split('/').pop() ?? '').startsWith('._'))).toBe(false);
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

    // Deloitte Custom Change: Verify a wrapping-folder upload is re-rooted before scanning.
    it('re-roots a one-level-deep zip (SKILL.md inside a wrapping folder) before scanning', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const zip = new JSZip();
      zip.file(
        'my-skill/SKILL.md',
        ['---', 'name: my-skill', 'description: A wrapped fixture.', '---', '', '# Body'].join(
          '\n',
        ),
      );
      zip.file('my-skill/scripts/helper.py', 'print("hello")\n');
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill.zip' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const scannedZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const fileEntries = Object.values(scannedZip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name);
      expect(fileEntries).toEqual(['SKILL.md', 'scripts/helper.py']);
      const scannedSkillMd = await scannedZip.file('SKILL.md')?.async('string');
      expect(scannedSkillMd).toContain('name:');
      const companionFile = await scannedZip.file('scripts/helper.py')?.async('string');
      expect(companionFile).toBe('print("hello")\n');
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

    it('falls back to scanning the raw archive instead of rewriting it when the entry count exceeds the import limit', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const zip = new JSZip();
      zip.file(
        'SKILL.md',
        [
          '---',
          'name: fixture-skill',
          'description: A fixture.',
          'always-apply: true',
          '---',
          '',
          '# Body',
        ].join('\n'),
      );
      for (let i = 0; i < 500; i++) {
        zip.file(`extra-${i}.txt`, 'x');
      }
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill.zip' });

      // No separate frontmatter-only scan call — the rewrite (and the
      // always-apply extraction that rides on it) never ran.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const scannedZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      expect(Object.keys(scannedZip.files).length).toBe(501);
      const scannedSkillMd = await scannedZip.file('SKILL.md')?.async('string');
      expect(scannedSkillMd).toMatch(/^always-apply\s*:/im);
    });

    it('falls back to scanning the raw archive instead of buffering an oversized SKILL.md entry', async () => {
      const fetchSpy = jest.fn().mockResolvedValue(passingResponse());
      global.fetch = fetchSpy as unknown as typeof fetch;

      const oversizedBody = 'a'.repeat(11 * 1024 * 1024);
      const zip = new JSZip();
      zip.file(
        'SKILL.md',
        ['---', 'name: fixture-skill', 'description: A fixture.', '---', '', oversizedBody].join(
          '\n',
        ),
      );
      const archive = await zip.generateAsync({ type: 'uint8array' });

      await scanSkillUpload({ archive, fileName: 'skill.zip' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const scannedZip = await scannedArchiveFrom(fetchSpy.mock.calls[0]);
      const scannedSkillMd = await scannedZip.file('SKILL.md')?.async('string');
      expect(scannedSkillMd?.length).toBeGreaterThan(11 * 1024 * 1024);
    }, 20000);
  });
});
