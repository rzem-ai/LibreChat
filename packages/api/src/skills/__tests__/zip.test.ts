import JSZip from 'jszip';

import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { renameSpacedFilePaths, rewriteRenamedFileReferences } from '../zip';

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
});
