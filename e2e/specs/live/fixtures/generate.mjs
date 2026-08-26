/**
 * Regenerates rag-orchid-charter.pdf. Zero dependencies — writes a valid
 * PDF 1.4 by hand (single page, Helvetica Type1, uncompressed text stream)
 * so pdfjs-dist can extract every token, including the ORCHID-7749 canary
 * the file-search spec asserts on. Only rerun if the demo text changes:
 *   node e2e/specs/live/fixtures/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const contentLines = [
  'BT',
  '/F1 14 Tf',
  '50 750 Td',
  '(Project ORCHID-7749 - Internal Program Charter) Tj',
  '/F1 10 Tf',
  '0 -20 Td',
  '(FICTIONAL TEST DATA - not a real Deloitte engagement.) Tj',
  '/F1 12 Tf',
  '0 -30 Td',
  '(ORCHID-7749 is the internal codename for the Q3 2026 telemetry) Tj',
  '0 -16 Td',
  '(pipeline migration. Program lead: Priya Ramanathan, Platform) Tj',
  '0 -16 Td',
  '(Reliability practice, Sydney. Charter approved 14 March 2026.) Tj',
  '0 -16 Td',
  '(Approved budget: AUD 2,480,000.) Tj',
  '0 -30 Td',
  '(Section 7 - Codename Ledger: an earlier proposal used the codename) Tj',
  '0 -16 Td',
  '(LOTUS-3320; that proposal was rejected on 02 February 2026.) Tj',
  'ET',
];
const content = contentLines.join('\n');
const contentBytes = Buffer.byteLength(content, 'latin1');

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${contentBytes} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
];

const chunks = [];
const push = (str) => chunks.push(Buffer.from(str, 'latin1'));
const currentLength = () => chunks.reduce((n, b) => n + b.length, 0);

push('%PDF-1.4\n%\xff\xff\xff\xff\n');
const offsets = [];
objects.forEach((obj, i) => {
  offsets.push(currentLength());
  push(`${i + 1} 0 obj\n${obj}\nendobj\n`);
});

const xrefStart = currentLength();
push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
for (const offset of offsets) {
  push(`${String(offset).padStart(10, '0')} 00000 n \n`);
}
push(
  `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
);

const dir = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(dir, 'rag-orchid-charter.pdf');
writeFileSync(outPath, Buffer.concat(chunks));
console.log(`Wrote ${outPath} (${Buffer.concat(chunks).length} bytes)`);

/**
 * Regenerates the txt/md/docx/xlsx siblings of the PDF fixture above, so the
 * file-search spec can assert the same RAG pipeline works across formats.
 * Same ORCHID-7749 / LOTUS-3320 facts as the PDF, repackaged per format, so
 * QUESTION/NEEDLE/CANARY stay identical across every file-type test.
 *
 * docx/xlsx are hand-built OOXML zips (no zip/docx/xlsx library) to match the
 * PDF generator's zero-dependency, byte-level approach. Only rerun if the
 * demo text changes: node e2e/specs/live/fixtures/generate.mjs
 */

// --- CRC32 (classic table-based implementation, no zlib version dependency) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed DOS date/time (2026-01-01, 00:00:00) so regenerating is byte-stable.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/**
 * Builds a valid, uncompressed ("stored") ZIP archive from a flat list of
 * { name, data } entries. Sufficient for OOXML containers (docx/xlsx), which
 * are just ZIPs with XML parts inside.
 */
function makeZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const centralDirOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, eocd]);
}

function writeFixture(filename, data) {
  const fixturePath = path.join(dir, filename);
  writeFileSync(fixturePath, data);
  console.log(`Wrote ${fixturePath} (${data.length} bytes)`);
}

// --- txt ---
const TXT_CONTENT = `Project ORCHID-7749 - Internal Program Charter

FICTIONAL TEST DATA - not a real Deloitte engagement.

ORCHID-7749 is the internal codename for the Q3 2026 telemetry pipeline
migration. Program lead: Priya Ramanathan, Platform Reliability practice,
Sydney. Charter approved 14 March 2026.

Approved budget: AUD 2,480,000.

Section 7 - Codename Ledger: an earlier proposal used the codename
LOTUS-3320; that proposal was rejected on 02 February 2026.
`;
writeFixture('rag-orchid-charter.txt', TXT_CONTENT);

// --- md (headers + table, exercises markdown-aware chunking) ---
const MD_CONTENT = `# Project ORCHID-7749 - Internal Program Charter

*FICTIONAL TEST DATA - not a real Deloitte engagement.*

## Charter Summary

| Field | Value |
| --- | --- |
| Codename | ORCHID-7749 |
| Program Lead | Priya Ramanathan (Platform Reliability, Sydney) |
| Charter Approved | 14 March 2026 |
| Approved Budget | AUD 2,480,000 |

ORCHID-7749 is the internal codename for the Q3 2026 telemetry pipeline migration.

## Section 7 - Codename Ledger

An earlier proposal used the codename LOTUS-3320; that proposal was rejected on 02 February 2026.
`;
writeFixture('rag-orchid-charter.md', MD_CONTENT);

// --- docx (minimal valid WordprocessingML: content types + root rels + document.xml) ---
const DOCX_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Project ORCHID-7749 - Internal Program Charter</w:t></w:r></w:p>
    <w:p><w:r><w:t>FICTIONAL TEST DATA - not a real Deloitte engagement.</w:t></w:r></w:p>
    <w:p><w:r><w:t>ORCHID-7749 is the internal codename for the Q3 2026 telemetry pipeline migration. Program lead: Priya Ramanathan, Platform Reliability practice, Sydney. Charter approved 14 March 2026.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Approved budget: AUD 2,480,000.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Section 7 - Codename Ledger: an earlier proposal used the codename LOTUS-3320; that proposal was rejected on 02 February 2026.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
`;
const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`;
const DOCX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`;
writeFixture(
  'rag-orchid-charter.docx',
  makeZip([
    { name: '[Content_Types].xml', data: DOCX_CONTENT_TYPES },
    { name: '_rels/.rels', data: DOCX_ROOT_RELS },
    { name: 'word/document.xml', data: DOCX_DOCUMENT_XML },
  ]),
);

// --- xlsx (two sheets: Charter key/value facts, Notes distractor - tests
// multi-sheet ingestion and whether row/column context survives chunking) ---
const XLSX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
`;
const XLSX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
`;
const XLSX_WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Charter" sheetId="1" r:id="rId1"/>
    <sheet name="Notes" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>
`;
const XLSX_WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>
`;
const inlineStr = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const XLSX_SHEET1_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">${inlineStr('A1', 'Field')}${inlineStr('B1', 'Value')}</row>
    <row r="2">${inlineStr('A2', 'Codename')}${inlineStr('B2', 'ORCHID-7749')}</row>
    <row r="3">${inlineStr('A3', 'Program Lead')}${inlineStr('B3', 'Priya Ramanathan (Platform Reliability, Sydney)')}</row>
    <row r="4">${inlineStr('A4', 'Charter Approved')}${inlineStr('B4', '14 March 2026')}</row>
    <row r="5">${inlineStr('A5', 'Approved Budget (AUD)')}<c r="B5"><v>2480000</v></c></row>
    <row r="6">${inlineStr('A6', 'Summary')}${inlineStr('B6', 'ORCHID-7749 is the internal codename for the Q3 2026 telemetry pipeline migration.')}</row>
  </sheetData>
</worksheet>
`;
const XLSX_SHEET2_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">${inlineStr('A1', 'Note')}</row>
    <row r="2">${inlineStr('A2', 'An earlier proposal used the codename LOTUS-3320; that proposal was rejected on 02 February 2026.')}</row>
  </sheetData>
</worksheet>
`;
writeFixture(
  'rag-orchid-charter.xlsx',
  makeZip([
    { name: '[Content_Types].xml', data: XLSX_CONTENT_TYPES },
    { name: '_rels/.rels', data: XLSX_ROOT_RELS },
    { name: 'xl/workbook.xml', data: XLSX_WORKBOOK_XML },
    { name: 'xl/_rels/workbook.xml.rels', data: XLSX_WORKBOOK_RELS },
    { name: 'xl/worksheets/sheet1.xml', data: XLSX_SHEET1_XML },
    { name: 'xl/worksheets/sheet2.xml', data: XLSX_SHEET2_XML },
  ]),
);
