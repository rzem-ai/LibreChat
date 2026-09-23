import JSZip from 'jszip';

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
});
