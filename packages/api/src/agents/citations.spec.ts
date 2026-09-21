import { Tools, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, MCPResultSource } from 'librechat-data-provider';
import {
  insertFileCitations,
  insertMCPCitations,
  insertSharePointCitations,
  appendGuaranteedMCPCitations,
  appendMCPDisclaimers,
  applyEndOfTraceCitations,
} from './citations';

const MARKER = '\ue202';

interface SourceInput {
  fileId: string;
  content: string;
  fileName?: string;
}

function textPart(text: string): TMessageContentParts {
  return { type: ContentTypes.TEXT, text } as TMessageContentParts;
}

function objectTextPart(value: string): TMessageContentParts {
  return { type: ContentTypes.TEXT, text: { value } } as TMessageContentParts;
}

function fileSearchAttachment(sources: SourceInput[]): TAttachment {
  return {
    type: Tools.file_search,
    messageId: 'msg-1',
    toolCallId: 'call-1',
    conversationId: 'conv-1',
    [Tools.file_search]: {
      sources: sources.map((source) => ({
        type: 'file',
        fileId: source.fileId,
        fileName: source.fileName ?? source.fileId,
        content: source.content,
        relevance: 0.9,
        pages: [],
        pageRelevance: {},
      })),
    },
  } as unknown as TAttachment;
}

function mcpAttachment(sources: MCPResultSource[], disclaimer?: string): TAttachment {
  return {
    type: Tools.mcp_results,
    messageId: 'msg-1',
    toolCallId: 'call-1',
    conversationId: 'conv-1',
    [Tools.mcp_results]: disclaimer ? { sources, disclaimer } : { sources },
  } as unknown as TAttachment;
}

function readText(part: TMessageContentParts): string {
  const value = (part as { text?: string | { value?: string } }).text;
  if (typeof value === 'string') {
    return value;
  }
  return value?.value ?? '';
}

function anchorCount(text: string, anchor: string): number {
  return text.split(anchor).length - 1;
}

const DESK_CONTENT =
  'Employees can reserve a desk up to fourteen days in advance through the workspace booking portal.';
const MEETING_CONTENT =
  'Meeting rooms may be booked via the calendar system for up to two hours per session.';
const AFR_ARTICLE =
  'The Reserve Bank held the cash rate steady at its meeting today, citing steady inflation.';
const OTHER_ARTICLE =
  'Shares in the mining sector rallied after a surprise jump in iron ore prices overseas.';

describe('insertFileCitations', () => {
  it('anchors a sentence grounded in a single passage', () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0file0`);
  });

  it('uses first-seen file index across two files', () => {
    const parts = [
      textPart(
        'You can reserve a desk fourteen days in advance. Meeting rooms are booked via the calendar system.',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([
        { fileId: 'fileA', content: DESK_CONTENT },
        { fileId: 'fileB', content: MEETING_CONTENT },
      ]),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0file0`);
    expect(text).toContain(`${MARKER}turn0file1`);
  });

  it('deduplicates multiple passages of the same file to a single anchor', () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    insertFileCitations(parts, [
      fileSearchAttachment([
        { fileId: 'fileA', content: DESK_CONTENT },
        { fileId: 'fileA', content: 'Reserve a desk fourteen days in advance via the portal.' },
      ]),
    ]);
    expect(anchorCount(readText(parts[0]), `${MARKER}turn0file0`)).toBe(1);
  });

  it('emits multiple anchors when a sentence clears threshold for two files', () => {
    const shared = 'reserve desk fourteen days advance booking portal workspace';
    const parts = [textPart('You can reserve a desk fourteen days in advance for booking.')];
    insertFileCitations(parts, [
      fileSearchAttachment([
        { fileId: 'fileA', content: shared },
        { fileId: 'fileB', content: shared },
      ]),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0file0`);
    expect(text).toContain(`${MARKER}turn0file1`);
  });

  it('increments the turn index per file_search attachment', () => {
    const parts = [
      textPart(
        'You can reserve a desk fourteen days in advance. Meeting rooms are booked via the calendar system.',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
      fileSearchAttachment([{ fileId: 'fileB', content: MEETING_CONTENT }]),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0file0`);
    expect(text).toContain(`${MARKER}turn1file0`);
  });

  it('does not anchor sentences below the similarity threshold', () => {
    const original = 'The weather outside is very pleasant today.';
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('skips short sentences below the minimum word count', () => {
    const original = 'Desk booking? Yes.';
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('is a no-op when there are no file_search sources', () => {
    const original = 'You can reserve a desk fourteen days in advance.';
    const parts = [textPart(original)];
    insertFileCitations(parts, []);
    expect(readText(parts[0])).toBe(original);
  });

  it('handles text stored as a { value } object', () => {
    const parts = [objectTextPart('You can reserve a desk fourteen days in advance.')];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0file0`);
  });

  it('skips nullish content parts without throwing', () => {
    const parts = [
      null,
      textPart('You can reserve a desk fourteen days in advance.'),
      undefined,
    ] as unknown as TMessageContentParts[];
    expect(() =>
      insertFileCitations(parts, [
        fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
      ]),
    ).not.toThrow();
    expect(readText(parts[1])).toContain(`${MARKER}turn0file0`);
  });

  it('keeps decimal numbers intact when anchoring the sentence', () => {
    const content = 'The applicant reported a GPA of 6.82/7 on their official academic transcript.';
    const parts = [textPart('The applicant reported a GPA of 6.82/7 on their transcript.')];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0file0`);
    expect(text).toContain('6.82/7');
    expect(text).not.toContain(`6. ${MARKER}`);
  });

  it('does not split a decimal that ends a sentence-like fragment', () => {
    const content = 'The measured accuracy of the model reached 6.82 percent overall.';
    const parts = [textPart('The measured accuracy of the model reached 6.82 percent.')];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0file0`);
    expect(text).toContain('6.82');
  });

  it('preserves content-part object references (mutates in place)', () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    const ref = parts[0];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(parts[0]).toBe(ref);
  });

  // Deloitte Custom Change: a file_search answer rendered as a markdown table must keep its
  // pipe/column count intact — a citation anchor must land inside a cell, never after the row's
  // closing pipe.
  it('anchors a markdown table row inside its last cell without corrupting the row', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| --- | --- |\n' +
          '| Desk Booking | You can reserve a desk fourteen days in advance through the booking portal |',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[2].trim().endsWith('|')).toBe(true);
    const cells = rows[2].split('|');
    expect(cells).toHaveLength(4);
    expect(cells[1].trim()).toBe('Desk Booking');
    expect(cells[2]).toContain(`${MARKER}turn0file0`);
    expect(cells[2]).toContain(
      'You can reserve a desk fourteen days in advance through the booking portal',
    );
  });

  // Deloitte Custom Change: a `\|` inside a cell is GFM's escape for a literal pipe that is not a
  // column separator — splitting on every `|` would fracture the cell and shift the anchor into a
  // phantom extra column.
  it('does not treat an escaped pipe inside a cell as a column boundary', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| --- | --- |\n' +
          '| Desk Booking | You can reserve a desk \\| workspace fourteen days in advance through the booking portal |',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toBe(
      '| Desk Booking | You can reserve a desk \\| workspace fourteen days in advance through the booking portal ' +
        `${MARKER}turn0file0 |`,
    );
  });

  // A pipe inside ordinary prose (no delimiter row anywhere nearby) must not be mistaken for a
  // table row — it should fall back to the sentence-boundary pass, keeping the pipe intact and
  // anchoring at the sentence, not a phantom cell.
  it('does not treat a prose line containing a pipe as a table row', () => {
    const parts = [
      textPart(
        'You can reserve a desk (standing | sitting) fourteen days in advance through the booking portal.',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const text = readText(parts[0]);
    expect(text.split('\n')).toHaveLength(1);
    expect(text).toContain('(standing | sitting)');
    expect(text).toContain(`${MARKER}turn0file0`);
  });

  // A shell-style command containing pipes must not be parsed as table cells even when its text
  // otherwise matches a source closely enough to be anchored.
  it('anchors a non-table line containing pipes without splitting it into cells', () => {
    const content = 'Run the audit using cat notes | grep foo | wc -l to count matches.';
    const parts = [textPart(content)];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text.split('\n')).toHaveLength(1);
    expect(text).toContain('cat notes | grep foo | wc -l');
    expect(text).toContain(`${MARKER}turn0file0`);
  });

  // A header row with no delimiter row directly beneath it is not a valid GFM table (e.g.
  // markdown streamed so far, or simply malformed) — it must not be parsed cell-by-cell.
  it('does not treat a header row with no delimiter row as a table', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| Desk Booking | You can reserve a desk fourteen days in advance through the booking portal |',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe(
      '| Desk Booking | You can reserve a desk fourteen days in advance through the booking portal |' +
        ` ${MARKER}turn0file0`,
    );
  });

  it('does not split a table row at a filename extension period', () => {
    const parts = [
      textPart(
        '| File | Summary |\n' +
          '| --- | --- |\n' +
          '| report.pdf | You can reserve a desk fourteen days in advance through the booking portal |',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const text = readText(parts[0]);
    const rows = text.split('\n');
    expect(rows).toHaveLength(3);
    expect(text).toContain('report.pdf');
    expect(rows[2].split('|')).toHaveLength(4);
  });

  // GFM permits a table row without edge pipes (`File | Summary` is as valid as
  // `| File | Summary |`) — that row must still be recognized as a table row, not fall through to
  // sentence splitting, which would split a filename like `report.pdf` mid-word.
  it('anchors a table row that omits the leading and trailing pipes', () => {
    const parts = [
      textPart(
        'File | Summary\n' +
          '--- | ---\n' +
          'report.pdf | You can reserve a desk fourteen days in advance through the booking portal',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const text = readText(parts[0]);
    const rows = text.split('\n');
    expect(rows).toHaveLength(3);
    expect(text).toContain('report.pdf');
    expect(rows[2]).toContain(`${MARKER}turn0file0`);
    expect(rows[2].startsWith('|')).toBe(false);
    expect(rows[2].endsWith('|')).toBe(false);
    expect(rows[2].split('|')).toHaveLength(2);
  });

  it('leaves a markdown table separator row untouched', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| --- | --- |\n' +
          '| Desk Booking | You can reserve a desk fourteen days in advance through the booking portal |',
      ),
    ];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const rows = readText(parts[0]).split('\n');
    expect(rows[1]).toBe('| --- | --- |');
  });
});

describe('insertMCPCitations', () => {
  it('anchors each sentence to the correct article by distinct fileIndex', () => {
    const parts = [
      textPart(
        'The Reserve Bank held the cash rate steady at its meeting today. ' +
          'Shares in the mining sector rallied after a surprise jump in iron ore prices.',
      ),
    ];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: OTHER_ARTICLE },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).toContain(`${MARKER}turn0mcp1`);
  });

  it('anchors a single source only once per line even when it matches several sentence fragments', () => {
    const docContent =
      'MyAssist Pilot Kick-off Pack usage guidance covers responsible use, human oversight, ' +
      'and sharing of skills during the pilot rollout across the organization.';
    const parts = [
      textPart(
        'DO: Review and accept the Terms and Conditions pop-up upon first access. ' +
          'Use client data with standard terms that include the AI tooling clause. ' +
          'Only use approved folders, repositories, or datasets during the pilot rollout.\n',
      ),
    ];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_read_file', serverName: 'sharepoint', content: docContent },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(anchorCount(text, `${MARKER}turn0mcp0`)).toBe(1);
  });

  it('re-anchors the same source on the next line after a same-line match', () => {
    const docContent =
      'MyAssist Pilot Kick-off Pack usage guidance covers responsible use, human oversight, ' +
      'and sharing of skills during the pilot rollout across the organization.';
    const parts = [
      textPart(
        'DO: Review and accept the Terms and Conditions pop-up upon first access. ' +
          'Only use approved folders, repositories, or datasets during the pilot rollout.\n' +
          'DO: Review and approve skills sharing and human oversight during the pilot rollout.\n',
      ),
    ];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_read_file', serverName: 'sharepoint', content: docContent },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(anchorCount(text, `${MARKER}turn0mcp0`)).toBe(2);
  });

  it('is a no-op when there are no mcp sources', () => {
    const original = 'The Reserve Bank held the cash rate steady at its meeting today.';
    const parts = [textPart(original)];
    insertMCPCitations(parts, [], 0);
    expect(readText(parts[0])).toBe(original);
  });

  it('anchors a paraphrased sentence that clears the lower MCP threshold but not the file threshold', () => {
    // Overlap ratio here is 5/9 ≈ 0.56: above MCP_SIMILARITY_THRESHOLD (0.35),
    // below the stricter file_search SIMILARITY_THRESHOLD (0.6).
    const passageContent =
      'macquarie group appointed ward chief executive mandate accelerate technology globally';
    const sentence = 'Macquarie Group named Ward as its new chief executive this week overall.';
    const mcpParts = [textPart(sentence)];
    insertMCPCitations(
      mcpParts,
      [mcpAttachment([{ toolName: 't', serverName: 's', content: passageContent }])],
      0,
    );
    expect(readText(mcpParts[0])).toContain(`${MARKER}turn0mcp0`);

    const fileParts = [textPart(sentence)];
    insertFileCitations(fileParts, [
      fileSearchAttachment([{ fileId: 'fileA', content: passageContent }]),
    ]);
    expect(readText(fileParts[0])).toBe(sentence);
  });

  it('returns the "turn:fileIndex" coordinates that received an anchor', () => {
    const parts = [
      textPart(
        'The Reserve Bank held the cash rate steady at its meeting today. ' +
          'This sentence has nothing at all to do with either article.',
      ),
    ];
    const usedCoords = insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: OTHER_ARTICLE },
        ]),
      ],
      0,
    );
    expect(usedCoords).toEqual(new Set(['0:0']));
  });

  // Deloitte Custom Change: table-row protection is shared infrastructure, not SharePoint-only —
  // any MCP connector's answer rendered as a table must keep its column count intact too.
  it('anchors a non-SharePoint MCP table row inside its last cell without corrupting the row', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| --- | --- |\n' +
          '| RBA Rates | The Reserve Bank held the cash rate steady at its meeting today |',
      ),
    ];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[2].trim().endsWith('|')).toBe(true);
    const cells = rows[2].split('|');
    expect(cells).toHaveLength(4);
    expect(cells[1].trim()).toBe('RBA Rates');
    expect(cells[2]).toContain(`${MARKER}turn0mcp0`);
    expect(cells[2]).toContain('The Reserve Bank held the cash rate steady at its meeting today');
  });

  // Two sources can both match the same row (e.g. a summary row referencing two distinct
  // articles) — both anchors must land in the same last cell, in source order, without adding
  // extra columns.
  it('anchors multiple matching sources into the same row, in order', () => {
    const parts = [
      textPart(
        '| Topic | Summary |\n' +
          '| --- | --- |\n' +
          '| Markets | The Reserve Bank held the cash rate steady at its meeting today, and shares in the mining sector rallied after a surprise jump in iron ore prices overseas |',
      ),
    ];
    const coords = insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: OTHER_ARTICLE },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(3);
    const cells = rows[2].split('|');
    expect(cells).toHaveLength(4);
    expect(cells[2]).toContain(`${MARKER}turn0mcp0`);
    expect(cells[2]).toContain(`${MARKER}turn0mcp1`);
    expect(coords).toEqual(new Set(['0:0', '0:1']));
  });
});

describe('insertSharePointCitations', () => {
  it('anchors a bulleted filename without splitting at the extension period', () => {
    const parts = [textPart('- Consulting Graduate Induction Workbook.pptx')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_list_recent',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'Consulting Graduate Induction Workbook.pptx',
          },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text.startsWith('- Consulting Graduate Induction Workbook.pptx')).toBe(true);
  });

  it('anchors a bold-wrapped numbered-list marker line', () => {
    const parts = [
      textPart(
        '**12.** GFS_style-guide.pptx URL: https://resources.deloitte.com/sites/Intellihub/SiteAssets/GFS_style-guide.pptx',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_list_recent',
            serverName: 'sharepoint',
            title: 'GFS_style-guide.pptx',
            content: 'GFS_style-guide.pptx',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('anchors a title whose own name ends in a real parenthetical', () => {
    const parts = [textPart('- Major Release 7.0.0 (MyAssist V2)')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Major Release 7.0.0 (MyAssist V2)',
            content: 'Major Release 7.0.0 (MyAssist V2)',
          },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text.startsWith('- Major Release 7.0.0 (MyAssist V2)')).toBe(true);
  });

  it('anchors a short folder name that would fail MIN_SENTENCE_CONTENT_WORDS', () => {
    const parts = [textPart('* Microsoft Teams Chat Files (1,436 items)')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_list_items',
            serverName: 'sharepoint',
            title: 'Microsoft Teams Chat Files',
            content: 'Microsoft Teams Chat Files',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('matches by exact fileIndex across multiple sources in one attachment', () => {
    const parts = [textPart('- Report A.docx\n- Report B.docx')];
    const usedCoords = insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report A.docx', content: 'a' },
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report B.docx', content: 'b' },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).toContain(`${MARKER}turn0mcp1`);
    expect(usedCoords).toEqual(new Set(['0:0', '0:1']));
  });

  it('advances the turn counter for a non-SharePoint attachment ahead of it', () => {
    const parts = [textPart('- Report A.docx')];
    const usedCoords = insertSharePointCitations(
      parts,
      [
        mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }]),
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report A.docx', content: 'a' },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn1mcp0`);
    expect(usedCoords).toEqual(new Set(['1:0']));
  });

  it('is a no-op when no attachment carries a SharePoint source', () => {
    const original = '- Report A.docx';
    const parts = [textPart(original)];
    const usedCoords = insertSharePointCitations(
      parts,
      [mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }])],
      0,
    );
    expect(readText(parts[0])).toBe(original);
    expect(usedCoords.size).toBe(0);
  });

  it('anchors a line where the model appends commentary after the exact title', () => {
    const parts = [textPart('- Major Release 7.0.0 (MyAssist V2) – last modified 26 August 2026')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Major Release 7.0.0 (MyAssist V2)',
            content: 'Major Release 7.0.0 (MyAssist V2)',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('anchors a line where the model swaps the extension for a trailing parenthetical', () => {
    const parts = [textPart('- UAT Release 6.2.0 Test Checklist (xlsx)')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'UAT Release 6.2.0 Test Checklist.xlsx',
            content: 'UAT Release 6.2.0 Test Checklist.xlsx',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('anchors a line where the model appends a trailing descriptor word with no punctuation', () => {
    const parts = [textPart('- Minor Release 6.2.0 documentation')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Minor Release 6.2.0',
            content: 'x',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('anchors despite an underscore-vs-space difference between the title and the rendered line', () => {
    const parts = [
      textPart('- 6.2.0 Release Readiness Checklist and Runsheets (73MB spreadsheet)'),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: '6.2.0_Release Readiness Checklist and Runsheets.xlsx',
            content: 'x',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('prefers the longer, more specific title when a short generic title also prefixes the line', () => {
    const parts = [textPart('- Release Announcements folder')];
    const usedCoords = insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Release', content: 'x' },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Release Announcements',
            content: 'y',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp1`);
    expect(readText(parts[0])).not.toContain(`${MARKER}turn0mcp0`);
    expect(usedCoords).toEqual(new Set(['0:1']));
  });

  it('does not anchor prose that merely mentions a filename mid-sentence', () => {
    const original = 'The document Report A.docx was updated last week.';
    const parts = [textPart(original)];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report A.docx', content: 'a' },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  // Deloitte Custom Change: a prefix match must stop at a word boundary, so a short title like
  // "Archive" doesn't consume an unrelated line like "Archived files" just because it's a string prefix.
  it('does not anchor a line whose title match is only a partial word', () => {
    const original = '- Archived files – last modified today';
    const parts = [textPart(original)];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Archive', content: 'a' },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  // Deloitte Custom Change: SharePoint results are just as often rendered as a markdown table as
  // a bulleted list, so a title must be matched cell-by-cell, not only at the start of the line.
  it('anchors a markdown table row by matching the cell containing the title', () => {
    const parts = [
      textPart(
        '| File Name | Location | Last Modified |\n' +
          '|---|---|---|\n' +
          '| Consulting Graduate Induction Workbook.pptx | AISolutionStudio | 9 Sep 2026 |',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'Consulting Graduate Induction Workbook.pptx',
          },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    const rows = text.split('\n');
    expect(rows).toHaveLength(3);
    const cells = rows[2].split('|');
    expect(cells).toHaveLength(5);
    expect(cells[1]).toContain(`${MARKER}turn0mcp0`);
    expect(cells[1]).toContain('Consulting Graduate Induction Workbook.pptx');
    expect(cells[2].trim()).toBe('AISolutionStudio');
    expect(cells[3].trim()).toBe('9 Sep 2026');
  });

  // GFM permits a table row without edge pipes — this must still be recognized as a table row
  // (matched cell-by-cell) instead of falling through to the line-prefix matcher, which would
  // split the filename at its extension period and miss it entirely.
  it('anchors a markdown table row that omits the leading and trailing pipes', () => {
    const parts = [
      textPart(
        'File Name | Location | Last Modified\n' +
          '--- | --- | ---\n' +
          'Consulting Graduate Induction Workbook.pptx | AISolutionStudio | 9 Sep 2026',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'Consulting Graduate Induction Workbook.pptx',
          },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    const rows = text.split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[2].startsWith('|')).toBe(false);
    expect(rows[2].endsWith('|')).toBe(false);
    const cells = rows[2].split('|');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toContain(`${MARKER}turn0mcp0`);
    expect(cells[0]).toContain('Consulting Graduate Induction Workbook.pptx');
    expect(cells[1].trim()).toBe('AISolutionStudio');
    expect(cells[2].trim()).toBe('9 Sep 2026');
  });

  it('does not anchor a table row whose cell match is only a partial word', () => {
    const original =
      '| File Name | Location | Last Modified |\n' +
      '|---|---|---|\n' +
      '| Archived Q3 Report | AISolutionStudio | 9 Sep 2026 |';
    const parts = [textPart(original)];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Archive', content: 'a' },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor a markdown table separator row', () => {
    const parts = [
      textPart(
        '| File Name | Location |\n' +
          '|---|---|\n' +
          '| Consulting Graduate Induction Workbook.pptx | AISolutionStudio |',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'Consulting Graduate Induction Workbook.pptx',
          },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0])?.split('\n') ?? [];
    expect(rows[1]).toBe('|---|---|');
  });

  it('leaves an unmatched table row untouched', () => {
    const original = '| Unrelated File.docx | SomeSite | today |';
    const parts = [textPart(original)];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'Consulting Graduate Induction Workbook.pptx',
          },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  // Mixed citations: a table row match and a separate bulleted-line match in the same answer must
  // both be anchored to the correct source, without either code path interfering with the other.
  it('anchors both a table row and a separate bulleted line in the same answer', () => {
    const parts = [
      textPart(
        '| File Name | Location |\n' +
          '|---|---|\n' +
          '| Report.pptx | Brand-Space |\n' +
          '\n' +
          '- Induction Workbook.docx',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report.pptx', content: 'a' },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Induction Workbook.docx',
            content: 'b',
          },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0]).split('\n');
    expect(rows).toHaveLength(5);
    expect(rows[2]).toContain(`${MARKER}turn0mcp0`);
    expect(rows[4]).toContain(`${MARKER}turn0mcp1`);
  });

  // A pipe inside a bulleted line that is not part of a table (no delimiter row anywhere in the
  // text) must not be parsed as table cells.
  it('does not treat a bulleted line containing a pipe as a table row', () => {
    const parts = [textPart('- Report.pptx | needs review')];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report.pptx', content: 'a' },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    expect(text.split('\n')).toHaveLength(1);
    expect(text).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: three sources can share the exact same filename (same file
  // uploaded to different folders) — each occurrence in the answer must credit a distinct
  // source, in the order those sources appeared in the tool result, not all the same one.
  it('credits each occurrence of a duplicate title to a distinct source, in source order', () => {
    const parts = [
      textPart(
        '| File Name | Location | Last Modified |\n' +
          '|---|---|---|\n' +
          '| 16x9_Timesaver_PPT.pptx | Brand-Space | 21 May 2025 |\n' +
          '| 16x9_Timesaver_PPT.pptx | DR-GR Brand Templates | 08 Jun 2026 |\n' +
          '| 16x9_Timesaver_PPT.pptx | DR-GR | 08 Jan 2026 |',
      ),
    ];
    insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: '16x9_Timesaver_PPT.pptx',
            content: 'Brand-Space copy',
          },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: '16x9_Timesaver_PPT.pptx',
            content: 'DR-GR Brand Templates copy',
          },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: '16x9_Timesaver_PPT.pptx',
            content: 'DR-GR copy',
          },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0])?.split('\n') ?? [];
    expect(rows[2]).toContain(`${MARKER}turn0mcp0`);
    expect(rows[3]).toContain(`${MARKER}turn0mcp1`);
    expect(rows[4]).toContain(`${MARKER}turn0mcp2`);
  });
});

describe('appendGuaranteedMCPCitations', () => {
  const KX_QUAL = 'assistance with ai governance and responsible ai ecosystem for the client';

  it('force-anchors a disclaimer-bearing source the lexical pass missed', () => {
    const parts = [textPart('The weather today has nothing to do with any of the sources.')];
    const usedCoords = insertMCPCitations(
      parts,
      [
        mcpAttachment(
          [{ toolName: 'kx_query', serverName: 'kx', content: KX_QUAL }],
          'Please review accuracy before reuse.',
        ),
      ],
      0,
    );
    appendGuaranteedMCPCitations(
      parts,
      [
        mcpAttachment(
          [{ toolName: 'kx_query', serverName: 'kx', content: KX_QUAL }],
          'Please review accuracy before reuse.',
        ),
      ],
      0,
      usedCoords,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: verify a SharePoint source is force-anchored even without a
  // disclaimer (the guarantee is scoped to disclaimer-bearing OR SharePoint sources).
  it('force-anchors a non-disclaimer SharePoint source the lexical pass missed', () => {
    const original = 'The weather today has nothing to do with any of the sources.';
    const parts = [textPart(original)];
    const attachments = [
      mcpAttachment([
        { toolName: 'sp_search', serverName: 'sharepoint', title: 'Report A.docx', content: 'a' },
      ]),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: a non-disclaimer, non-SharePoint source that the model never
  // referenced in the answer must not get a citation chip for text the user never reads about.
  it('does not force-anchor a non-disclaimer, non-SharePoint source the lexical pass missed', () => {
    const original = 'The weather today has nothing to do with any of the sources.';
    const parts = [textPart(original)];
    const attachments = [
      mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }]),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not duplicate an anchor for a source the lexical pass already matched', () => {
    const parts = [textPart(`${KX_QUAL}.`)];
    const attachments = [
      mcpAttachment(
        [{ toolName: 'kx_query', serverName: 'kx', content: KX_QUAL }],
        'Please review accuracy before reuse.',
      ),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    expect(anchorCount(readText(parts[0]), `${MARKER}turn0mcp0`)).toBe(1);
  });

  it('is a no-op when the lexical pass already matched every source', () => {
    const parts = [textPart(`${OTHER_ARTICLE} And that's the news.`)];
    const attachments = [
      mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }]),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    const afterLexicalPass = readText(parts[0]);
    expect(afterLexicalPass).toContain(`${MARKER}turn0mcp0`);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    expect(readText(parts[0])).toBe(afterLexicalPass);
  });
});

describe('appendMCPDisclaimers', () => {
  const DISCLAIMER = 'Please review accuracy of all the responses before reusing them.';

  it('appends the disclaimer and a guidelines link once', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(
      parts,
      [mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER)],
      'https://resources.deloitte.com/sites/kx/usage-guidelines',
    );
    const text = readText(parts[0]);
    expect(text).toContain(DISCLAIMER);
    expect(text).toContain(
      '[usage guidelines](https://resources.deloitte.com/sites/kx/usage-guidelines)',
    );
  });

  it('omits the guidelines link when the disclaimer already references usage guidelines itself', () => {
    const parts = [textPart('Here is the answer.')];
    const disclaimerWithOwnLink =
      `${DISCLAIMER} See ` +
      '[usage guidelines](https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx) ' +
      'Citations [1](https://example.com/1) have usage restrictions.';
    appendMCPDisclaimers(
      parts,
      [
        mcpAttachment(
          [{ toolName: 'kx_query', serverName: 'kx', content: 'x' }],
          disclaimerWithOwnLink,
        ),
      ],
      'https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx',
    );
    const text = readText(parts[0]) ?? '';
    expect(anchorCount(text, 'usage guidelines')).toBe(1);
  });

  it('omits the link when no guidelines URL is configured', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(DISCLAIMER);
    expect(text).not.toContain('usage guidelines');
  });

  it('dedupes identical disclaimer text across two attachments', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER),
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'y' }], DISCLAIMER),
    ]);
    expect(anchorCount(readText(parts[0]), DISCLAIMER)).toBe(1);
  });

  it('uses only the first disclaimer when two attachments carry different-but-overlapping text', () => {
    const parts = [textPart('Here is the answer.')];
    const secondDisclaimer = `${DISCLAIMER} See usage guidelines.`;
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER),
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'y' }], secondDisclaimer),
    ]);
    const text = readText(parts[0]);
    expect(anchorCount(text, 'Please review accuracy')).toBe(1);
    expect(text).not.toContain(secondDisclaimer);
  });

  it('is a no-op when no attachment carries a disclaimer', () => {
    const original = 'Here is the answer.';
    const parts = [textPart(original)];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });
});

describe('tokenize stemming', () => {
  const passageContent =
    'the bank governor reported steady inflation figures across several industries';
  const sentence = 'Analysts said the governor reports steady inflation figures across industry.';

  it('matches different inflections of the same fact for MCP citations', () => {
    const parts = [textPart(sentence)];
    insertMCPCitations(
      parts,
      [mcpAttachment([{ toolName: 't', serverName: 's', content: passageContent }])],
      0,
    );
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  it('does not stem file_search matching, to avoid retuning an already-shipped feature', () => {
    const parts = [textPart(sentence)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: passageContent }]),
    ]);
    expect(readText(parts[0])).toBe(sentence);
  });
});

describe('applyEndOfTraceCitations', () => {
  it('resolves artifact promises and inserts anchors', async () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }])),
      ],
      fileCitations: true,
    });
    expect(readText(parts[0])).toContain(`${MARKER}turn0file0`);
  });

  it('is a no-op when fileCitations is false', async () => {
    const original = 'You can reserve a desk fourteen days in advance.';
    const parts = [textPart(original)];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }])),
      ],
      fileCitations: false,
    });
    expect(readText(parts[0])).toBe(original);
  });

  it('ignores non-file_search attachments', async () => {
    const original = 'You can reserve a desk fourteen days in advance.';
    const parts = [textPart(original)];
    const memoryAttachment = {
      type: Tools.memory,
      messageId: 'msg-1',
      toolCallId: 'call-1',
      conversationId: 'conv-1',
    } as unknown as TAttachment;
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [Promise.resolve(memoryAttachment)],
      fileCitations: true,
    });
    expect(readText(parts[0])).toBe(original);
  });

  it('never throws and leaves the answer intact when a promise rejects', async () => {
    const original = 'You can reserve a desk fourteen days in advance.';
    const parts = [textPart(original)];
    await expect(
      applyEndOfTraceCitations({
        contentParts: parts,
        artifactPromises: [Promise.reject(new Error('boom'))],
        fileCitations: true,
      }),
    ).resolves.toBeUndefined();
    expect(readText(parts[0])).toBe(original);
  });

  it('splices insertMCPCitations, guaranteed anchors, and the disclaimer in order for an unmatched kx source', async () => {
    const disclaimer = 'Please review accuracy of all the responses before reusing them.';
    const parts = [textPart('The answer discusses something unrelated to the qual content.')];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          mcpAttachment(
            [
              {
                toolName: 'kx_query',
                serverName: 'kx',
                content: 'a specific qual about ai governance work',
              },
            ],
            disclaimer,
          ),
        ),
      ],
      fileCitations: true,
      mcpUsageGuidelinesUrl: 'https://resources.deloitte.com/sites/kx/usage-guidelines',
    });
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).toContain(disclaimer);
    expect(text).toContain(
      '[usage guidelines](https://resources.deloitte.com/sites/kx/usage-guidelines)',
    );
    expect(text.indexOf(`${MARKER}turn0mcp0`)).toBeLessThan(text.indexOf(disclaimer));
  });

  it('anchors SharePoint sources by line and other MCP sources by sentence in the same turn set', async () => {
    const parts = [
      textPart(
        '- Consulting Graduate Induction Workbook.pptx\nShares in the mining sector rallied after a surprise jump in iron ore prices overseas.',
      ),
    ];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          mcpAttachment([
            {
              toolName: 'sp_list_recent',
              serverName: 'sharepoint',
              title: 'Consulting Graduate Induction Workbook.pptx',
              content: 'Consulting Graduate Induction Workbook.pptx',
            },
          ]),
        ),
        Promise.resolve(
          mcpAttachment([
            { toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE },
          ]),
        ),
      ],
      fileCitations: true,
    });
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).toContain(`${MARKER}turn1mcp0`);
    expect(anchorCount(text, `${MARKER}turn0mcp0`)).toBe(1);
  });

  // Deloitte Custom Change: an un-anchored SharePoint listing source is excluded from the
  // lexical pass (its short filename+URL content isn't safe sentence-splitter input), but must
  // still receive the guaranteed fallback anchor so it isn't left with no citation at all.
  it('force-anchors an un-anchored SharePoint listing source via the guaranteed pass, not the lexical pass', async () => {
    const original =
      'The style guide covering formatting rules is available at ' +
      'https://resources.deloitte.com/sites/Intellihub/SiteAssets/GFS_style-guide.pptx for review.';
    const parts = [textPart(original)];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          mcpAttachment([
            {
              toolName: 'sp_list_recent',
              serverName: 'sharepoint',
              title: 'GFS_style-guide.pptx',
              link: 'https://resources.deloitte.com/sites/Intellihub/SiteAssets/GFS_style-guide.pptx',
              content:
                'GFS_style-guide.pptx\n\nhttps://resources.deloitte.com/sites/Intellihub/SiteAssets/GFS_style-guide.pptx',
            },
          ]),
        ),
      ],
      fileCitations: true,
    });
    const text = readText(parts[0]);
    expect(anchorCount(text, `${MARKER}turn0mcp0`)).toBe(1);
    expect(text).toBe(`${original} ${MARKER}turn0mcp0`);
  });

  it('falls back to the lexical pass for a SharePoint source answered as prose instead of a filename line', async () => {
    const parts = [
      textPart(
        'The key business stakeholders include Central Identity & Security Engineering, who operate the governing tenant.',
      ),
    ];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          mcpAttachment([
            {
              toolName: 'sp_read_file',
              serverName: 'sharepoint',
              title: 'Microsoft MTG.docx',
              content:
                'Central Identity & Security Engineering operate the governing tenant and manage discovery, governance relationships, baselines, and monitors.',
            },
          ]),
        ),
      ],
      fileCitations: true,
    });
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
  });

  it('skips a malformed MCP attachment without throwing and keeps turn numbering in sync for the real one', async () => {
    const parts = [textPart('- Consulting Graduate Induction Workbook.pptx')];
    const malformedAttachment = {
      type: Tools.mcp_results,
      messageId: 'msg-1',
      toolCallId: 'call-0',
      conversationId: 'conv-1',
      [Tools.mcp_results]: undefined,
    } as unknown as TAttachment;
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(malformedAttachment),
        Promise.resolve(
          mcpAttachment([
            {
              toolName: 'sp_list_recent',
              serverName: 'sharepoint',
              title: 'Consulting Graduate Induction Workbook.pptx',
              content: 'Consulting Graduate Induction Workbook.pptx',
            },
          ]),
        ),
      ],
      fileCitations: true,
    });
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).not.toContain(`${MARKER}turn1mcp0`);
  });
});
