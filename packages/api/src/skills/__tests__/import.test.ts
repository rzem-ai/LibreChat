import JSZip from 'jszip';
import { Types } from 'mongoose';

import type { ISkill, ISkillFile, CreateSkillResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ImportSkillDeps } from '../import';

import { createImportHandler, parseFrontmatter } from '../import';

type ImportRequest = Parameters<ReturnType<typeof createImportHandler>>[0];

interface MockResponse extends Response {
  body?: unknown;
}

interface ImportSummary {
  filesProcessed: number;
  filesSucceeded: number;
  filesFailed: number;
  errors: Array<{ path: string; status: 'ok' | 'error'; error?: string }>;
}

function mockResponse(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn((statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  }) as MockResponse['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as MockResponse['json'];
  return res;
}

function mockImportDeps(limits?: ImportSkillDeps['limits']): ImportSkillDeps {
  const skillId = new Types.ObjectId();
  const skill = {
    _id: skillId,
    name: 'tiny-limit-skill',
    description: 'A skill used by import handler tests.',
  } as ISkill & { _id: Types.ObjectId };
  const skillFile = { _id: new Types.ObjectId() } as ISkillFile & { _id: Types.ObjectId };

  return {
    limits,
    createSkill: jest.fn(async () => ({ skill }) as unknown as CreateSkillResult),
    getSkillById: jest.fn(async () => skill),
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    upsertSkillFile: jest.fn(async () => skillFile),
    saveBuffer: jest.fn(async () => ({ filepath: '/tmp/imported-file', source: 'local' })),
    grantPermission: jest.fn(async () => undefined),
    resolveScannerToken: jest.fn(async () => undefined),
  };
}

function mockZipRequest(buffer: Buffer): ImportRequest {
  return {
    user: {
      id: 'user-1',
      _id: new Types.ObjectId(),
      username: 'tester',
    },
    file: {
      originalname: 'tiny-limit-skill.skill',
      buffer,
    },
  } as unknown as ImportRequest;
}

function mockMarkdownRequest(content: string, originalname = 'bad-frontmatter.md'): ImportRequest {
  return {
    user: {
      id: 'user-1',
      _id: new Types.ObjectId(),
      username: 'tester',
    },
    file: {
      originalname,
      buffer: Buffer.from(content),
    },
  } as unknown as ImportRequest;
}

function importSummary(body: unknown): ImportSummary {
  return (body as { _importSummary: ImportSummary })._importSummary;
}

async function zipWithAdditionalFiles(fileCount: number, fileBytes: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'SKILL.md',
    [
      '---',
      'name: tiny-limit-skill',
      'description: A skill used by import handler tests.',
      '---',
      '# Test skill',
    ].join('\n'),
  );
  const content = 'a'.repeat(fileBytes);
  for (let i = 0; i < fileCount; i++) {
    zip.file(`files/${i}.txt`, content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function zipWithSkillMarkdown(skillMarkdown: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('SKILL.md', skillMarkdown);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('parseFrontmatter', () => {
  it('extracts name + description from a minimal frontmatter block', () => {
    const raw = `---\nname: demo\ndescription: A demo skill.\n---\n\n# Body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'demo',
      description: 'A demo skill.',
      alwaysApply: undefined,
      invalidBooleans: [],
    });
  });

  it('coerces non-string scalar name and description to strings', () => {
    const raw = `---\nname: 123\ndescription: 2024\n---\n\n# Body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: '123',
      description: '2024',
      alwaysApply: undefined,
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: true', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'legal',
      description: 'Legal rules.',
      alwaysApply: true,
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: false', () => {
    const raw = `---\nname: optional\ndescription: Optional rules.\nalways-apply: false\n---\n\nOptional body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'optional',
      description: 'Optional rules.',
      alwaysApply: false,
      invalidBooleans: [],
    });
  });

  it('extracts alwaysApply: true', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalwaysApply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'legal',
      description: 'Legal rules.',
      alwaysApply: true,
      invalidBooleans: [],
    });
  });

  it('lets always-apply win when both spellings are present', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: false\nalwaysApply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw).alwaysApply).toBe(false);
  });

  it('ignores invalid alwaysApply alias when canonical always-apply is valid', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: true\nalwaysApply: yes\n---\n\n# Legal body`;
    const result = parseFrontmatter(raw);

    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('ignores invalid alwaysApply alias before a valid canonical always-apply', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalwaysApply: yes\nalways-apply: false\n---\n\n# Legal body`;
    const result = parseFrontmatter(raw);

    expect(result.alwaysApply).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('flags non-boolean always-apply values as invalid (no silent drop)', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: yes\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('flags non-boolean alwaysApply values as invalid (no silent drop)', () => {
    const raw = `---\nname: n\ndescription: d\nalwaysApply: yes\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['alwaysApply']);
  });

  it('flags legacy YAML boolean aliases as invalid', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: on\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it.each(['null', '~'])('flags always-apply: %s as invalid', (value) => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: ${value}\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('does not flag always-apply when the key is absent', () => {
    const raw = `---\nname: n\ndescription: d\n---\n\nbody`;
    expect(parseFrontmatter(raw).invalidBooleans).toEqual([]);
  });

  it('does not flag always-apply when the value is an empty string (treated as absent)', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply:\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('is case-insensitive on the key but strict on the value', () => {
    const raw = `---\nname: n\ndescription: d\nALWAYS-APPLY: TRUE\n---\n\nbody`;
    expect(parseFrontmatter(raw).alwaysApply).toBe(true);
  });

  it('handles quoted values correctly', () => {
    const raw = `---\nname: "quoted-name"\ndescription: 'quoted desc'\nalways-apply: "true"\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'quoted-name',
      description: 'quoted desc',
      alwaysApply: true,
      invalidBooleans: [],
    });
  });

  it('returns empty fields when no frontmatter block is present', () => {
    const raw = '# Just a body with no frontmatter';
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      invalidBooleans: [],
    });
  });

  it('extracts frontmatter after a BOM and leading blank lines', () => {
    const raw = `\uFEFF\n\n---\nname: prologue\ndescription: Has leading whitespace.\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'prologue',
      description: 'Has leading whitespace.',
      alwaysApply: undefined,
      invalidBooleans: [],
    });
  });

  it('does not treat frontmatter scalar lines that start with --- text as closing fences', () => {
    const raw = `---\nname: marker\ndescription: 'first\n---not a closing fence\nlast'\nalways-apply: false\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'marker',
      description: 'first ---not a closing fence last',
      alwaysApply: false,
      invalidBooleans: [],
    });
  });

  it('returns empty fields when frontmatter is unterminated', () => {
    const raw = `---\nname: incomplete\n`;
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      invalidBooleans: [],
    });
  });

  it('returns empty fields when frontmatter YAML is malformed', () => {
    const raw = `---\nname: [\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual(
      expect.objectContaining({
        name: '',
        description: '',
        invalidBooleans: [],
        parseError: expect.any(String),
      }),
    );
  });

  it('ignores always-apply appearing outside the frontmatter block', () => {
    const raw = `---\nname: n\ndescription: d\n---\n\nalways-apply: true (but this is in the body)`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('tolerates a YAML inline comment after the boolean value', () => {
    const raw = `---\nname: commented\ndescription: demo.\nalways-apply: true # auto-prime every turn\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('treats a comment-only always-apply value as absent (mid-edit placeholder)', () => {
    const raw = `---\nname: only-comment\ndescription: demo.\nalways-apply: # nothing here yet\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('flags a typo value as invalid even when followed by a comment', () => {
    const raw = `---\nname: typo\ndescription: demo.\nalways-apply: tru # typo\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('handles a quoted boolean value followed by an inline comment', () => {
    const raw = `---\nname: quoted-comment\ndescription: demo.\nalways-apply: "true" # note\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('handles a single-quoted false with an inline comment', () => {
    const raw = `---\nname: single-quote\ndescription: demo.\nalways-apply: 'false' # off\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });
});

describe('createImportHandler', () => {
  it('uses request-scoped import limits', async () => {
    const buffer = await zipWithAdditionalFiles(0, 0);
    const deps = mockImportDeps(() => ({
      maxZipBytes: buffer.length - 1,
    }));
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('File too large'),
      }),
    );
  });

  it('counts rejected oversized zip entries toward the cumulative decompressed limit', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 10,
      maxSingleFileBytes: 10 * kib,
      maxDecompressedBytes: 32 * kib,
    });
    const handler = createImportHandler(deps);
    const buffer = await zipWithAdditionalFiles(4, 11 * kib);
    const res = mockResponse();

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const summary = importSummary(res.body);
    expect(summary.filesProcessed).toBe(3);
    expect(summary.filesSucceeded).toBe(0);
    expect(summary.filesFailed).toBe(3);
    expect(summary.errors).toHaveLength(3);
  });

  it('rejects malformed YAML frontmatter in markdown imports', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockMarkdownRequest('---\nname: [\n---\n\nbody'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({
            field: 'frontmatter',
            code: 'INVALID_YAML',
          }),
        ]),
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('rejects malformed YAML frontmatter in archive imports', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const buffer = await zipWithSkillMarkdown('---\nname: [\n---\n\nbody');

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({
            field: 'frontmatter',
            code: 'INVALID_YAML',
          }),
        ]),
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  // Deloitte Custom Change: Verify macOS metadata is stripped inside handleZip when the
  // skill scanner is not configured (open source / self-hosted deployments without
  // SKILL_SCANNER_URL). This is the primary fix for the original bug — scanSkillUpload
  // no-ops when the scanner is disabled, so handleZip is the only protection.
  it('strips __MACOSX, ._* and .DS_Store entries in handleZip when scanner is not configured', async () => {
    // Explicitly disable the scanner so this test is deterministic regardless of
    // what SKILL_SCANNER_URL is set to in the environment or by other test suites.
    const savedScannerUrl = process.env.SKILL_SCANNER_URL;
    delete process.env.SKILL_SCANNER_URL;

    try {
      const deps = mockImportDeps();
      const handler = createImportHandler(deps);
      const res = mockResponse();

      const zip = new JSZip();

      // Level 3 skill: SKILL.md + reference doc + subfolders for scripts, references, and assets
      zip.file(
        'skill-name/SKILL.md',
        '---\nname: mac-skill\ndescription: A macOS-created skill.\n---\n# Body',
      );
      zip.file('skill-name/FORMS.md', '# Form-filling guide');
      zip.file('skill-name/scripts/fill_form.py', 'print("hello")');
      zip.file('skill-name/references/api-schema.json', '{"api": "schema"}');
      zip.file('skill-name/assets/template.txt', 'template');

      // .DS_Store files at multiple depths — Finder writes one per folder it opens
      zip.file('skill-name/.DS_Store', '');
      zip.file('skill-name/scripts/.DS_Store', '');
      zip.file('.DS_Store', '');

      // __MACOSX/ mirror — Finder injects one sidecar per file with extended attributes
      zip.file('__MACOSX/skill-name/._SKILL.md', '');
      zip.file('__MACOSX/skill-name/._FORMS.md', '');
      zip.file('__MACOSX/skill-name/scripts/._fill_form.py', '');
      zip.file('__MACOSX/skill-name/references/._api-schema.json', '');
      zip.file('__MACOSX/skill-name/assets/._template.txt', '');

      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await handler(mockZipRequest(buffer), res);

      // Import succeeds and only the 4 real Level 3 files are stored (SKILL.md is consumed as body)
      expect(res.status).toHaveBeenCalledWith(201);
      const summary = importSummary(res.body);
      expect(summary.filesProcessed).toBe(4);
      expect(summary.filesSucceeded).toBe(4);
      expect(summary.filesFailed).toBe(0);

      // None of the macOS entries should have reached storage
      expect(deps.upsertSkillFile).toHaveBeenCalledTimes(4);
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'FORMS.md' }),
      );
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'scripts/fill_form.py' }),
      );
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'references/api-schema.json' }),
      );
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'assets/template.txt' }),
      );
    } finally {
      if (savedScannerUrl === undefined) {
        delete process.env.SKILL_SCANNER_URL;
      } else {
        process.env.SKILL_SCANNER_URL = savedScannerUrl;
      }
    }
  });

  // Deloitte Custom Change: Verify stripZipArtifacts removes hidden files and accidentally
  // included dependency directories at all levels when the scanner is not configured.
  it('strips hidden files and artifact directories at all levels when scanner is not configured', async () => {
    const savedScannerUrl = process.env.SKILL_SCANNER_URL;
    delete process.env.SKILL_SCANNER_URL;

    try {
      const deps = mockImportDeps();
      const handler = createImportHandler(deps);
      const res = mockResponse();

      const zip = new JSZip();

      // Real skill files, including valid underscore-prefixed Python modules
      zip.file('SKILL.md', '---\nname: python-skill\ndescription: A Python skill.\n---\n# Body');
      zip.file('scripts/run.py', 'print("hello")');
      zip.file('scripts/_helpers.py', 'def helper(): pass');
      zip.file('scripts/__init__.py', '');

      // Hidden files and accidentally included directories at nested levels
      zip.file('.env', 'SECRET=value');
      zip.file('skill-name/.gitignore', '.venv/');
      zip.file('skill-name/.venv/bin/python', '');
      zip.file('skill-name/.venv/lib/python3.11/site-packages/pandas/__init__.py', '');
      zip.file('skill-name/scripts/__pycache__/run.cpython-311.pyc', '');
      zip.file('skill-name/assets/node_modules/lodash/index.js', '');
      zip.file('skill-name/references/.git/config', '');

      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await handler(mockZipRequest(buffer), res);

      // Import succeeds and only real skill files are stored (SKILL.md is consumed as body)
      expect(res.status).toHaveBeenCalledWith(201);
      const summary = importSummary(res.body);
      expect(summary.filesProcessed).toBe(3);
      expect(summary.filesSucceeded).toBe(3);
      expect(summary.filesFailed).toBe(0);

      // Artifact entries are absent while valid Python modules remain available
      expect(deps.upsertSkillFile).toHaveBeenCalledTimes(3);
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'scripts/run.py' }),
      );
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'scripts/_helpers.py' }),
      );
      expect(deps.upsertSkillFile).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: 'scripts/__init__.py' }),
      );
    } finally {
      if (savedScannerUrl === undefined) {
        delete process.env.SKILL_SCANNER_URL;
      } else {
        process.env.SKILL_SCANNER_URL = savedScannerUrl;
      }
    }
  });
});
