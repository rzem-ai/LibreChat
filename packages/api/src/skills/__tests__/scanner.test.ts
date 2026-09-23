import JSZip from 'jszip';

import { scanSkillUpload } from '../scanner';

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
});
