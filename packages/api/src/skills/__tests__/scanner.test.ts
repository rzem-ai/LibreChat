import JSZip from 'jszip';

import { scanSkillUpload } from '../scanner';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';

describe('scanSkillUpload', () => {
  const savedScannerUrl = process.env.SKILL_SCANNER_URL;

  beforeEach(() => {
    process.env.SKILL_SCANNER_URL = 'https://scanner.example.com/scan';
  });

  afterEach(() => {
    if (savedScannerUrl === undefined) {
      delete process.env.SKILL_SCANNER_URL;
    } else {
      process.env.SKILL_SCANNER_URL = savedScannerUrl;
    }
    jest.restoreAllMocks();
  });

  it('scans renamed (hyphenated) paths instead of silently dropping spaced entries', async () => {
    const zip = new JSZip();
    zip.file(
      'my skill/SKILL.md',
      '---\nname: my-skill\ndescription: A skill used by scanner tests.\n---\n\nSee references/notes with space.md',
    );
    zip.file('my skill/references/notes with space.md', 'notes');
    const archive = await zip.generateAsync({ type: 'uint8array' });

    let scannedPaths: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const formData = init?.body as FormData;
      const file = formData.get('file') as Blob;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const scannedZip = await JSZip.loadAsync(bytes);
      scannedPaths = Object.keys(scannedZip.files);
      return new Response(
        JSON.stringify({ validation: { passed: true }, scan: { is_safe: true } }),
        { status: 200 },
      );
    });

    await scanSkillUpload({ archive, fileName: 'my skill.zip' });

    expect(scannedPaths).toContain('references/notes-with-space.md');
    expect(scannedPaths).not.toContain('references/notes with space.md');
  });

  it('scans the transformed archive instead of falling back to the original bytes when unique content fits the budget', async () => {
    // Rename, rewrite, the SKILL.md strip-read, and re-rooting each read an entry's
    // decompressed bytes. Before sharing a per-entry cache across those passes, each
    // read re-charged the shared budget for the same bytes, so an archive whose real
    // (unique) content comfortably fits `maxDecompressedBytes` could still exhaust the
    // budget partway through — tripping stripInternalFrontmatterFromZip's/reRootZip's
    // `null` fallback and sending the ORIGINAL (untransformed, still-spaced-path)
    // archive to the scanner, even though handleZip would go on to import the
    // transformed one. A tight-but-sufficient budget here reproduces exactly that gap.
    const skillMd =
      '---\nname: my-skill\ndescription: A skill used by scanner budget tests.\n---\n\nSee notes with space.md';
    const notes = 'Reference notes content used to pad this fixture to a realistic size.';
    const zip = new JSZip();
    zip.file('my skill/SKILL.md', skillMd);
    zip.file('my skill/notes with space.md', notes);
    const archive = await zip.generateAsync({ type: 'uint8array' });

    const uniqueBytes = Buffer.byteLength(skillMd, 'utf-8') + Buffer.byteLength(notes, 'utf-8');
    const limits = { ...DEFAULT_SKILL_IMPORT_LIMITS, maxDecompressedBytes: uniqueBytes + 5 };

    let scannedPaths: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const formData = init?.body as FormData;
      const file = formData.get('file') as Blob;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const scannedZip = await JSZip.loadAsync(bytes);
      scannedPaths = Object.keys(scannedZip.files);
      return new Response(
        JSON.stringify({ validation: { passed: true }, scan: { is_safe: true } }),
        { status: 200 },
      );
    });

    await scanSkillUpload({ archive, fileName: 'my skill.zip', limits });

    expect(scannedPaths).toContain('notes-with-space.md');
    expect(scannedPaths).not.toContain('my skill/notes with space.md');
  });
});
