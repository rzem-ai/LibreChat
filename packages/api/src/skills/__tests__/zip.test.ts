import JSZip from 'jszip';

import { DEFAULT_SKILL_IMPORT_LIMITS, createDecompressionBudget } from '../limits';
import {
  renameSpacedFilePaths,
  SkillManifestConflictError,
  rewriteRenamedFileReferences,
} from '../zip';

async function readText(zip: JSZip, entryPath: string): Promise<string> {
  const entry = zip.file(entryPath);
  if (entry == null) {
    throw new Error(`Missing entry: ${entryPath}`);
  }
  return entry.async('string');
}

describe('renameSpacedFilePaths', () => {
  it('replaces spaces in a root-level filename with hyphens', async () => {
    const zip = new JSZip();
    zip.file('a test name.pdf', 'content');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([{ oldPath: 'a test name.pdf', newPath: 'a-test-name.pdf' }]);
    expect(zip.file('a-test-name.pdf')).not.toBeNull();
    expect(zip.file('a test name.pdf')).toBeNull();
  });

  it('replaces spaces in folder segments as well as the basename', async () => {
    const zip = new JSZip();
    zip.file('fortune-cookie/references/many fortunes.md', 'content');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([
      {
        oldPath: 'fortune-cookie/references/many fortunes.md',
        newPath: 'fortune-cookie/references/many-fortunes.md',
      },
    ]);
    expect(zip.file('fortune-cookie/references/many-fortunes.md')).not.toBeNull();
  });

  it('leaves filenames without spaces untouched', async () => {
    const zip = new JSZip();
    zip.file('a-test-name.pdf', 'content');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([]);
    expect(zip.file('a-test-name.pdf')).not.toBeNull();
  });

  it('skips directory entries', async () => {
    const zip = new JSZip();
    zip.folder('a folder');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([]);
  });

  it('disambiguates a rename that collides with an existing entry instead of overwriting it', async () => {
    const zip = new JSZip();
    zip.file('foo-bar.txt', 'existing');
    zip.file('foo bar.txt', 'renamed');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([{ oldPath: 'foo bar.txt', newPath: 'foo-bar-2.txt' }]);
    expect(await readText(zip, 'foo-bar.txt')).toBe('existing');
    expect(await readText(zip, 'foo-bar-2.txt')).toBe('renamed');
  });

  it('disambiguates multiple colliding renames with successive numeric suffixes', async () => {
    const zip = new JSZip();
    zip.file('foo bar-x.txt', 'first');
    zip.file('foo-bar x.txt', 'second');

    const renames = await renameSpacedFilePaths(zip);

    const newPaths = renames.map((rename) => rename.newPath).sort();
    expect(newPaths).toEqual(['foo-bar-x-2.txt', 'foo-bar-x.txt']);
  });

  it('leaves an entry unrenamed when it exceeds the per-file decompressed-size bound', async () => {
    const zip = new JSZip();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 'a');
    zip.file('big file.bin', oversized);

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([]);
    expect(zip.file('big file.bin')).not.toBeNull();
    expect(zip.file('big-file.bin')).toBeNull();
  });

  it('honors a caller-supplied, stricter limit instead of the default', async () => {
    const zip = new JSZip();
    zip.file('small file.txt', Buffer.alloc(1024, 'a'));

    const strictLimits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxSingleFileBytes: 100 };
    const renames = await renameSpacedFilePaths(zip, strictLimits);

    expect(renames).toEqual([]);
    expect(zip.file('small file.txt')).not.toBeNull();
    expect(zip.file('small-file.txt')).toBeNull();
  });

  it('disambiguates a rename against the archive-flattened namespace handleZip persists into', async () => {
    const zip = new JSZip();
    zip.file('skill/SKILL.md', 'manifest');
    zip.file('skill/a b.txt', 'nested content');
    zip.file('a-b.txt', 'existing root content');

    const renames = await renameSpacedFilePaths(zip);

    expect(renames).toEqual([{ oldPath: 'skill/a b.txt', newPath: 'skill/a-b-2.txt' }]);
    expect(await readText(zip, 'skill/a-b-2.txt')).toBe('nested content');
    expect(await readText(zip, 'a-b.txt')).toBe('existing root content');
  });

  it('does not treat a renamed wrapper folder as colliding with itself', async () => {
    const zip = new JSZip();
    zip.file('my skill/SKILL.md', 'manifest');
    zip.file('my skill/notes.txt', 'notes');

    const renames = await renameSpacedFilePaths(zip);

    const newPaths = renames.map((rename) => rename.newPath).sort();
    expect(newPaths).toEqual(['my-skill/SKILL.md', 'my-skill/notes.txt']);
  });

  it('rejects an archive whose renamed manifest would collide with another entry, instead of silently swapping which file is "the manifest"', async () => {
    // Disambiguating the manifest itself (e.g. to `my-skill/SKILL-2.md`) would leave
    // `my-skill/SKILL.md` — a file that was never the selected manifest — as the entry
    // `findSkillMdPath` picks up on its next (post-rename) call in handleZip/scanner.ts,
    // silently importing the wrong file as "the skill". Rejecting outright is the only
    // safe option (see `SkillManifestConflictError`'s docs).
    const zip = new JSZip();
    zip.file('my skill/SKILL.md', 'wrapped manifest');
    zip.file('my-skill/SKILL.md', 'existing root manifest');

    await expect(renameSpacedFilePaths(zip)).rejects.toThrow(SkillManifestConflictError);
    // Rejected before any mutation of the entry that would have collided.
    expect(await readText(zip, 'my-skill/SKILL.md')).toBe('existing root manifest');
  });
});

describe('shared decompression budget', () => {
  it('carries decompressed bytes forward from renameSpacedFilePaths into rewriteRenamedFileReferences', async () => {
    const zip = new JSZip();
    zip.file('foo bar.txt', Buffer.alloc(40, 'a'));
    const reference = 'See foo bar.txt for details.';
    const skillMdContent = reference + 'x'.repeat(50 - reference.length);
    zip.file('SKILL.md', skillMdContent);

    const strictLimits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxDecompressedBytes: 50 };
    const budget = createDecompressionBudget(strictLimits);

    const renames = await renameSpacedFilePaths(zip, strictLimits, budget);
    expect(renames).toEqual([{ oldPath: 'foo bar.txt', newPath: 'foo-bar.txt' }]);
    expect(budget.remaining).toBeLessThan(50);

    await rewriteRenamedFileReferences(zip, renames, strictLimits, budget);

    // A fresh 50-byte budget would have fit this 50-byte SKILL.md exactly, so it
    // would have been rewritten. Sharing the budget with the rename pass above
    // leaves too little of it remaining, so SKILL.md is left untouched instead.
    expect(await readText(zip, 'SKILL.md')).toBe(skillMdContent);
  });

  it("reuses a renamed entry's decompressed buffer in rewriteRenamedFileReferences instead of re-charging the budget for it", async () => {
    const zip = new JSZip();
    zip.file('foo bar.txt', Buffer.alloc(40, 'a'));

    // Exactly enough headroom for a single 40-byte decompression, not two.
    const limits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxDecompressedBytes: 45 };
    const budget = createDecompressionBudget(limits);

    const renames = await renameSpacedFilePaths(zip, limits, budget);
    expect(renames).toEqual([{ oldPath: 'foo bar.txt', newPath: 'foo-bar.txt' }]);
    expect(budget.remaining).toBe(5);

    // The rewrite pass iterates every entry — including the one just renamed — to look
    // for references to rewrite. It must reuse the buffer the rename pass already
    // decompressed for foo-bar.txt rather than decompressing (and re-charging for) it
    // again, or this second read alone would blow the remaining 5-byte allowance.
    await rewriteRenamedFileReferences(zip, renames, limits, budget);
    expect(budget.remaining).toBe(5);
  });

  it("evicts a rewritten entry's cache slot when the rewrite grows it past the per-file limit, instead of letting a stale cache hit serve an oversized buffer", async () => {
    const zip = new JSZip();
    // Both renames collapse to the same candidate name, so the second is disambiguated
    // with a numeric suffix — growing its replacement target by two characters.
    zip.file('foo bar-x.txt', 'first');
    zip.file('foo-bar x.txt', 'second');
    const notes = 'ref: foo-bar x.txt';
    zip.file('notes.txt', notes);

    const limits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxSingleFileBytes: notes.length };
    const budget = createDecompressionBudget(limits);

    const renames = await renameSpacedFilePaths(zip, limits, budget);
    await rewriteRenamedFileReferences(zip, renames, limits, budget);

    const rewritten = 'ref: foo-bar-x-2.txt';
    expect(rewritten.length).toBeGreaterThan(limits.maxSingleFileBytes);
    // The zip entry itself still holds the correctly rewritten content...
    expect(await readText(zip, 'notes.txt')).toBe(rewritten);
    // ...but it must not be cached, or handleZip's companion loop would later trust
    // this cache hit and skip its own maxSingleFileBytes check entirely.
    expect(budget.cache.has('notes.txt')).toBe(false);
  });
});

describe('rewriteRenamedFileReferences', () => {
  it('rewrites a literal full-path reference in another text file', async () => {
    const zip = new JSZip();
    zip.file('references/many fortunes.md', 'a fortune');
    zip.file('SKILL.md', 'See references/many fortunes.md for details.');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe('See references/many-fortunes.md for details.');
  });

  it('rewrites a bare basename reference when the full path is not present', async () => {
    const zip = new JSZip();
    zip.file('references/many fortunes.md', 'a fortune');
    zip.file('SKILL.md', 'Run `cat many fortunes.md` to read it.');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe('Run `cat many-fortunes.md` to read it.');
  });

  it('leaves a wrapper-relative reference untouched when only the wrapping folder is renamed', async () => {
    const zip = new JSZip();
    zip.file('my skill/SKILL.md', 'See references/guide.md for details.');
    zip.file('my skill/references/guide.md', 'a guide');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'my-skill/SKILL.md')).toBe('See references/guide.md for details.');
  });

  it('rewrites a reference relative to an intermediate renamed folder', async () => {
    const zip = new JSZip();
    zip.file('my-skill/SKILL.md', 'See reference notes/guide.md for details.');
    zip.file('my-skill/reference notes/guide.md', 'a guide');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'my-skill/SKILL.md')).toBe(
      'See reference-notes/guide.md for details.',
    );
  });

  it('does not modify binary file contents', async () => {
    const zip = new JSZip();
    zip.file('assets/logo image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00]));
    zip.file(
      'assets/other.bin',
      Buffer.from([0x00, 0x01, 0x02, 0x6c, 0x6f, 0x67, 0x6f, 0x20, 0x69, 0x6d, 0x61, 0x67, 0x65]),
    );

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    const otherEntry = zip.file('assets/other.bin');
    expect(otherEntry).not.toBeNull();
    const bytes = await otherEntry!.async('nodebuffer');
    expect(Array.from(bytes)).toEqual([
      0x00, 0x01, 0x02, 0x6c, 0x6f, 0x67, 0x6f, 0x20, 0x69, 0x6d, 0x61, 0x67, 0x65,
    ]);
  });

  it('is a no-op when there are no renames', async () => {
    const zip = new JSZip();
    zip.file('SKILL.md', 'no references here');

    await rewriteRenamedFileReferences(zip, []);

    expect(await readText(zip, 'SKILL.md')).toBe('no references here');
  });

  it('leaves an oversized entry unrewritten instead of fully decompressing it', async () => {
    const zip = new JSZip();
    zip.file('references/many fortunes.md', 'a fortune');
    const oversized = `${'a'.repeat(11 * 1024 * 1024)} references/many fortunes.md`;
    zip.file('SKILL.md', oversized);

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe(oversized);
  });

  it('honors a caller-supplied, stricter limit instead of the default', async () => {
    const zip = new JSZip();
    zip.file('references/many fortunes.md', 'a fortune');
    zip.file('SKILL.md', 'See references/many fortunes.md for details.');

    const renames = await renameSpacedFilePaths(zip);
    const strictLimits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxSingleFileBytes: 5 };
    await rewriteRenamedFileReferences(zip, renames, strictLimits);

    expect(await readText(zip, 'SKILL.md')).toBe('See references/many fortunes.md for details.');
  });

  it('drops an ambiguous basename reference instead of rewriting it to the wrong target', async () => {
    const zip = new JSZip();
    zip.file('a/foo-bar.txt', 'pre-existing a content');
    zip.file('a/foo bar.txt', 'renamed a content');
    zip.file('b/foo bar.txt', 'renamed b content');
    zip.file('SKILL.md', 'See a/foo bar.txt, b/foo bar.txt, and bare foo bar.txt for details.');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe(
      'See a/foo-bar-2.txt, b/foo-bar.txt, and bare foo bar.txt for details.',
    );
  });

  it("still rewrites a full-path reference that coincides with a different rename's ambiguous suffix", async () => {
    const zip = new JSZip();
    zip.file('a/foo bar.txt', 'content a');
    zip.file('b/a/foo-bar.txt', 'pre-existing nested content');
    zip.file('b/a/foo bar.txt', 'content nested b');
    zip.file('SKILL.md', 'See a/foo bar.txt, b/a/foo bar.txt, and bare foo bar.txt for details.');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe(
      'See a/foo-bar.txt, b/a/foo-bar-2.txt, and bare foo bar.txt for details.',
    );
  });

  it('does not rewrite a renamed name when it is only a substring of a longer name', async () => {
    const zip = new JSZip();
    zip.file('foo bar.md', 'content');
    zip.file('SKILL.md', 'See foo bar.md for the summary and keep foo bar.md.bak untouched.');

    const renames = await renameSpacedFilePaths(zip);
    await rewriteRenamedFileReferences(zip, renames);

    expect(await readText(zip, 'SKILL.md')).toBe(
      'See foo-bar.md for the summary and keep foo bar.md.bak untouched.',
    );
  });
});
