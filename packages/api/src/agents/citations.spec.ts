import { Tools, ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  TAttachment,
  MCPResultSource,
  OrganicResult,
  TopStoryResult,
} from 'librechat-data-provider';
import {
  insertFileCitations,
  insertMCPCitations,
  insertWebSearchCitations,
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

function mcpAttachment(
  sources: MCPResultSource[],
  disclaimer?: string,
  dpnUsageRestriction?: boolean,
): TAttachment {
  return {
    type: Tools.mcp_results,
    messageId: 'msg-1',
    toolCallId: 'call-1',
    conversationId: 'conv-1',
    [Tools.mcp_results]: {
      sources,
      ...(disclaimer ? { disclaimer } : {}),
      ...(dpnUsageRestriction ? { dpnUsageRestriction } : {}),
    },
  } as unknown as TAttachment;
}

function webSearchAttachment(
  turn: number,
  organic?: Array<Partial<OrganicResult> & { title?: string; content?: string }>,
  topStories?: Array<Partial<TopStoryResult> & { title?: string; content?: string }>,
): TAttachment {
  return {
    type: Tools.web_search,
    messageId: 'msg-1',
    toolCallId: 'call-1',
    conversationId: 'conv-1',
    [Tools.web_search]: {
      turn,
      ...(organic
        ? { organic: organic.map((result) => ({ link: 'https://example.com', ...result })) }
        : {}),
      ...(topStories
        ? { topStories: topStories.map((result) => ({ link: 'https://example.com', ...result })) }
        : {}),
    },
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

  it('does not split or anchor inside a markdown link URL', () => {
    const content =
      'The style guide covering formatting is at https://resources.deloitte.com/sites/GFS_style-guide.pptx for review.';
    const parts = [
      textPart(
        'See the [style guide](https://resources.deloitte.com/sites/GFS_style-guide.pptx) for formatting rules.',
      ),
    ];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text).toContain(
      '[style guide](https://resources.deloitte.com/sites/GFS_style-guide.pptx)',
    );
    expect(text).toContain(`${MARKER}turn0file0`);
  });

  it('does not split or anchor inside a bare URL', () => {
    const content =
      'The style guide covering formatting is at https://resources.deloitte.com/sites/GFS_style-guide.pptx for review.';
    const parts = [
      textPart(
        'The style guide covering formatting is at https://resources.deloitte.com/sites/GFS_style-guide.pptx for review.',
      ),
    ];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text).toContain('https://resources.deloitte.com/sites/GFS_style-guide.pptx for review');
    expect(text).toContain(`${MARKER}turn0file0`);
  });

  it('splits and anchors correctly when a sentence-ending period immediately follows a bare URL', () => {
    const content =
      'The booking portal is available at https://intranet.acme.com/booking/desk.reservation.portal.v2 for making desk reservations.';
    const parts = [
      textPart(
        'The booking portal is available at https://intranet.acme.com/booking/desk.reservation.portal.v2. Weather today is sunny and mild.',
      ),
    ];
    insertFileCitations(parts, [fileSearchAttachment([{ fileId: 'fileA', content }])]);
    const text = readText(parts[0]);
    expect(text).toContain('https://intranet.acme.com/booking/desk.reservation.portal.v2');
    expect(anchorCount(text, `${MARKER}turn0file0`)).toBe(1);
    expect(text.indexOf(`${MARKER}turn0file0`)).toBeLessThan(text.indexOf('Weather'));
  });

  it('preserves content-part object references (mutates in place)', () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    const ref = parts[0];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(parts[0]).toBe(ref);
  });

  it('does not anchor text inside an artifact fenced code block, but still anchors surrounding prose', () => {
    const original = [
      'You can reserve a desk fourteen days in advance.',
      '',
      ':::artifact{identifier="desk-microsite" type="text/html" title="Desk Booking"}',
      '````',
      '<!-- You can reserve a desk fourteen days in advance. -->',
      '<p>You can reserve a desk fourteen days in advance.</p>',
      '````',
      ':::',
      '',
      'Meeting rooms are booked via the calendar system.',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([
        { fileId: 'fileA', content: DESK_CONTENT },
        { fileId: 'fileB', content: MEETING_CONTENT },
      ]),
    ]);
    const text = readText(parts[0]);
    const lines = text.split('\n');

    expect(lines[0]).toContain(`${MARKER}turn0file0`);
    expect(lines[9]).toContain(`${MARKER}turn0file1`);
    expect(lines[4]).not.toContain(MARKER);
    expect(lines[5]).not.toContain(MARKER);
  });

  it('does not anchor text inside a plain (non-artifact) fenced code block', () => {
    const original = ['```', 'You can reserve a desk fourteen days in advance.', '```'].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('respects the outer fence length so a nested shorter fence does not close the range early', () => {
    const original = [
      ':::artifact{identifier="doc" type="text/markdown" title="Doc"}',
      '````',
      'Some intro text.',
      '```',
      'You can reserve a desk fourteen days in advance.',
      '```',
      'You can reserve a desk fourteen days in advance.',
      '````',
      ':::',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor text inside a plain tilde-fenced code block', () => {
    const original = ['~~~', 'You can reserve a desk fourteen days in advance.', '~~~'].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not close a tilde fence with a same-length backtick line', () => {
    const original = [
      '~~~',
      'You can reserve a desk fourteen days in advance.',
      '```',
      'You can reserve a desk fourteen days in advance.',
      '~~~',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor text inside a fenced code block quoted with a blockquote prefix', () => {
    const original = [
      '> ```js',
      '> You can reserve a desk fourteen days in advance.',
      '> ```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor text inside a nested blockquote fence, and does not let a shallower-quoted fence line close it', () => {
    const original = [
      '> > ```js',
      '> ```',
      '> > You can reserve a desk fourteen days in advance.',
      '> > ```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not let a deeper-quoted fence line close a shallower fence', () => {
    const original = [
      '> ```js',
      '> > ```',
      '> You can reserve a desk fourteen days in advance.',
      '> ```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor text inside a fenced code block indented under a list item', () => {
    const original = [
      '- Reservation policy:',
      '',
      '  ```js',
      '  You can reserve a desk fourteen days in advance.',
      '  ```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not let a 4-space-indented backtick line inside the block close the fence early', () => {
    const original = [
      '```js',
      '    ```',
      'You can reserve a desk fourteen days in advance.',
      '```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('closes a list-item fence whose continuation lines are indented to the marker width', () => {
    const original = [
      '- ```js',
      '  You can reserve a desk fourteen days in advance.',
      '  ```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('does not treat an unindented line after a list-marker-prefixed fence as fence content, per CommonMark', () => {
    const original = ['- ```js', 'You can reserve a desk fourteen days in advance.', '```'].join(
      '\n',
    );
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const lines = readText(parts[0]).split('\n');
    expect(lines[0]).toBe('- ```js');
    expect(lines[1]).toContain(`${MARKER}turn0file0`);
  });

  it('does not treat a 4-space-indented backtick line as a fence open, so real prose before a later fence still gets cited', () => {
    const original = [
      '    ```',
      'You can reserve a desk fourteen days in advance.',
      '```',
      'unrelated code',
      '```',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    const lines = readText(parts[0]).split('\n');
    expect(lines[1]).toContain(`${MARKER}turn0file0`);
  });

  it('excludes through the end of the text when a fence is never closed (truncated response)', () => {
    const original = [
      'Some intro prose.',
      '```js',
      'You can reserve a desk fourteen days in advance.',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('excludes through the end of the text when a tilde fence is never closed', () => {
    const original = [
      'Some intro prose.',
      '~~~js',
      'You can reserve a desk fourteen days in advance.',
    ].join('\n');
    const parts = [textPart(original)];
    insertFileCitations(parts, [
      fileSearchAttachment([{ fileId: 'fileA', content: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  // a file_search answer rendered as a markdown table must keep its
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

  it('does not anchor MCP-matched text inside an artifact fenced code block', () => {
    const original = [
      'The Reserve Bank held the cash rate steady at its meeting today.',
      '',
      ':::artifact{identifier="rates-summary" type="text/markdown" title="Rates Summary"}',
      '````',
      'The Reserve Bank held the cash rate steady at its meeting today.',
      '````',
      ':::',
    ].join('\n');
    const parts = [textPart(original)];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
        ]),
      ],
      0,
    );
    const text = readText(parts[0]);
    const lines = text.split('\n');
    expect(lines[0]).toContain(`${MARKER}turn0mcp0`);
    expect(lines[4]).not.toContain(MARKER);
  });

  it('does not anchor MCP-matched text when a fence is never closed (truncated response)', () => {
    const original = [
      '```',
      'The Reserve Bank held the cash rate steady at its meeting today.',
    ].join('\n');
    const parts = [textPart(original)];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  it('does not anchor MCP-matched text when a tilde fence is never closed', () => {
    const original = [
      '~~~',
      'The Reserve Bank held the cash rate steady at its meeting today.',
    ].join('\n');
    const parts = [textPart(original)];
    insertMCPCitations(
      parts,
      [
        mcpAttachment([
          { toolName: 'afr_get_latest_news', serverName: 'afr', content: AFR_ARTICLE },
        ]),
      ],
      0,
    );
    expect(readText(parts[0])).toBe(original);
  });

  // table-row protection is shared infrastructure, not SharePoint-only — any MCP connector's
  // answer rendered as a table must keep its column count intact too.
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

describe('insertWebSearchCitations', () => {
  it('anchors a sentence grounded in an organic result', () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    insertWebSearchCitations(parts, [
      webSearchAttachment(0, [{ title: 'Desk Booking', snippet: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0search0`);
  });

  it('anchors a sentence grounded only in the snippet when the result also has scraped content', () => {
    // A processed organic result can carry both a scraped `content` body and the provider's
    // own `snippet` — the snippet can state a fact the scrape doesn't repeat. A sentence
    // grounded only in that snippet fact must still match, not be silently dropped because
    // `content` alone was indexed.
    const parts = [textPart('New starters get a fourteen-day free trial of the premium plan.')];
    insertWebSearchCitations(parts, [
      webSearchAttachment(0, [
        {
          title: 'Desk Booking',
          content: DESK_CONTENT,
          snippet: 'New starters get a fourteen-day free trial of the premium membership plan.',
        },
      ]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0search0`);
  });

  it('anchors a sentence grounded in a news result', () => {
    const parts = [textPart(AFR_ARTICLE)];
    insertWebSearchCitations(parts, [webSearchAttachment(0, undefined, [{ title: AFR_ARTICLE }])]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0news0`);
  });

  it('leaves an unmatched sentence uncited', () => {
    const parts = [textPart('This sentence has nothing to do with any retrieved result at all.')];
    insertWebSearchCitations(parts, [
      webSearchAttachment(0, [{ title: 'Desk Booking', snippet: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).not.toContain(MARKER);
  });

  it("uses the attachment's own turn value, not a synthesized index", () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    insertWebSearchCitations(parts, [
      webSearchAttachment(3, [{ title: 'Desk Booking', snippet: DESK_CONTENT }]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn3search0`);
  });

  it('anchors organic and news results independently within the same attachment', () => {
    const parts = [
      textPart(
        'You can reserve a desk fourteen days in advance. The Reserve Bank held the cash rate steady at its meeting today.',
      ),
    ];
    insertWebSearchCitations(parts, [
      webSearchAttachment(
        0,
        [{ title: 'Desk Booking', snippet: DESK_CONTENT }],
        [{ title: AFR_ARTICLE }],
      ),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0search0`);
    expect(text).toContain(`${MARKER}turn0news0`);
  });

  it('is a no-op when there are no organic or news results', () => {
    const original = 'You can reserve a desk fourteen days in advance.';
    const parts = [textPart(original)];
    insertWebSearchCitations(parts, [webSearchAttachment(0)]);
    expect(readText(parts[0])).toBe(original);
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

  it('does not anchor a filename line inside an artifact fenced code block', () => {
    const original = [
      '- Consulting Graduate Induction Workbook.pptx',
      '',
      ':::artifact{identifier="listing" type="text/markdown" title="Listing"}',
      '````',
      '- Consulting Graduate Induction Workbook.pptx',
      '````',
      ':::',
    ].join('\n');
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
    const lines = readText(parts[0]).split('\n');
    expect(lines[0]).toContain(`${MARKER}turn0mcp0`);
    expect(lines[4]).not.toContain(MARKER);
  });

  it('does not anchor a filename line when a fence is never closed (truncated response)', () => {
    const original = ['````', '- Consulting Graduate Induction Workbook.pptx'].join('\n');
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

  it('does not anchor a filename line when a tilde fence is never closed', () => {
    const original = ['~~~~', '- Consulting Graduate Induction Workbook.pptx'].join('\n');
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

  it('anchors a later prose mention when the same filename appeared earlier inside a fence', () => {
    const original = [
      '````',
      '- Consulting Graduate Induction Workbook.pptx',
      '````',
      '',
      '- Consulting Graduate Induction Workbook.pptx',
    ].join('\n');
    const parts = [textPart(original)];
    const usedCoords = insertSharePointCitations(
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
    const lines = readText(parts[0]).split('\n');
    expect(lines[1]).not.toContain(MARKER);
    expect(lines[4]).toContain(`${MARKER}turn0mcp0`);
    expect(usedCoords.has('0:0')).toBe(true);
  });

  // Deloitte Custom Change: CommonMark allows the single space after a blockquote `>` marker to
  // be omitted, so an opening fence written as "> ```js" can be legally closed by "```" prefixed
  // with just ">" (no trailing space). The scanner must compare blockquote nesting depth, not the
  // exact prefix string, or it treats the fence as never closed and swallows the rest of the
  // message.
  it('closes a blockquoted fence whose close line omits the space after the marker', () => {
    const original = [
      '> ```js',
      '> - Consulting Graduate Induction Workbook.pptx',
      '>```',
      '',
      '- Consulting Graduate Induction Workbook.pptx',
    ].join('\n');
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
    const lines = readText(parts[0]).split('\n');
    expect(lines[1]).not.toContain(MARKER);
    expect(lines[4]).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: a fence delimiter may be indented at most 3 spaces beyond its
  // container prefix; a tab expands to a full tab stop and already exceeds that cap on its own,
  // so a tab-indented backtick run is plain content, not a fence opener, and must not exclude the
  // filename line that follows it.
  it('does not treat a tab-indented backtick run as a fence opener', () => {
    const original = ['\t```', '- Consulting Graduate Induction Workbook.pptx'].join('\n');
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
    const lines = readText(parts[0]).split('\n');
    expect(lines[1]).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: a single table row can carry more than one SharePoint source in
  // different cells (e.g. a file and its parent folder both matched); every matching cell must
  // get its own anchor instead of only the first.
  it('anchors every matching cell in a table row, not just the first', () => {
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
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'AISolutionStudio',
            content: 'AISolutionStudio',
          },
        ]),
      ],
      0,
    );
    const rows = readText(parts[0]).split('\n');
    const cells = rows[2].split('|');
    expect(cells[1]).toContain(`${MARKER}turn0mcp0`);
    expect(cells[2]).toContain(`${MARKER}turn0mcp1`);
  });

  // Deloitte Custom Change: a message can contain more than one artifact. If the first fence is
  // closed using a blockquote-marker whitespace variant (previously mis-recognized as unclosed),
  // the false "extend to end-of-text" fallback would have swallowed the second artifact and all
  // the prose around it. This proves both artifacts are excluded independently and the prose
  // around each is still cited.
  it('handles multiple artifacts independently when the first is closed with a blockquote marker variant', () => {
    const original = [
      '- Consulting Graduate Induction Workbook.pptx',
      '',
      '> ```js',
      '> - Consulting Graduate Induction Workbook.pptx',
      '>```',
      '',
      '- Consulting Graduate Induction Workbook.pptx',
      '',
      '````',
      '- Consulting Graduate Induction Workbook.pptx',
      '````',
      '',
      '- Consulting Graduate Induction Workbook.pptx',
    ].join('\n');
    const parts = [textPart(original)];
    const usedCoords = insertSharePointCitations(
      parts,
      [
        mcpAttachment([
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'copy 1',
          },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'copy 2',
          },
          {
            toolName: 'sp_search',
            serverName: 'sharepoint',
            title: 'Consulting Graduate Induction Workbook.pptx',
            content: 'copy 3',
          },
        ]),
      ],
      0,
    );
    const lines = readText(parts[0]).split('\n');
    expect(lines[0]).toContain(`${MARKER}turn0mcp0`);
    expect(lines[3]).not.toContain(MARKER);
    expect(lines[6]).toContain(`${MARKER}turn0mcp1`);
    expect(lines[9]).not.toContain(MARKER);
    expect(lines[12]).toContain(`${MARKER}turn0mcp2`);
    expect(usedCoords.has('0:0')).toBe(true);
    expect(usedCoords.has('0:1')).toBe(true);
    expect(usedCoords.has('0:2')).toBe(true);
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

  // Deloitte Custom Change: a DPN source carries its restriction via its own
  // `usageRestriction` flag rather than `disclaimer`, so it must still be force-anchored
  // when unmatched, even with no top-level `usage_guidelines`/disclaimer.
  it('force-anchors an unmatched DPN source that has no disclaimer', () => {
    const original = 'The weather today has nothing to do with any of the sources.';
    const parts = [textPart(original)];
    const attachments = [
      mcpAttachment([
        {
          toolName: 'dpn_search',
          serverName: 'dpn',
          content: 'Jane Doe, Partner',
          usageRestriction: true,
        },
      ]),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    expect(readText(parts[0])).toContain(`${MARKER}turn0mcp0`);
  });

  // Deloitte Custom Change: `dpnUsageRestriction` on the payload is an aggregate ("some
  // source in this batch is a DPN profile") and must not force-anchor every other,
  // unrelated source in the same attachment — only the specific source flagged
  // `usageRestriction` needs the guarantee.
  it('only force-anchors the specific usage-restricted source, not every source in the attachment', () => {
    const original = 'The weather today has nothing to do with any of the sources.';
    const parts = [textPart(original)];
    const attachments = [
      mcpAttachment([
        {
          toolName: 'kx_query',
          serverName: 'kx',
          content: 'Jane Doe, Partner',
          usageRestriction: true,
        },
        { toolName: 'kx_query', serverName: 'kx', content: 'Unrelated quals result' },
      ]),
    ];
    const usedCoords = insertMCPCitations(parts, attachments, 0);
    appendGuaranteedMCPCitations(parts, attachments, 0, usedCoords);
    const text = readText(parts[0]);
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).not.toContain(`${MARKER}turn0mcp1`);
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
  const STATIC_MESSAGE =
    'Please note that this response uses data from the KX and DPN Connector. Review the accuracy of ' +
    'all KX and DPN citations before reusing them.';

  it('appends the fixed KX disclaimer with a guidelines link once configured', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(
      parts,
      [mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER)],
      'https://resources.deloitte.com/sites/kx/usage-guidelines',
    );
    const text = readText(parts[0]);
    expect(text).toContain(STATIC_MESSAGE);
    expect(text).toContain(
      '[KX usage guidelines](https://resources.deloitte.com/sites/kx/usage-guidelines)',
    );
    expect(text).not.toContain(DISCLAIMER);
  });

  // Deloitte Custom Change: KX_USAGE_GUIDELINES_URL is empty in .env.example, so a default
  // setup must still render a clickable link rather than non-clickable placeholder text.
  it('falls back to the default guidelines URL when none is configured', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER),
    ]);
    const text = readText(parts[0]) ?? '';
    expect(text).toContain(STATIC_MESSAGE);
    expect(text).toContain(
      '[KX usage guidelines](https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx)',
    );
  });

  it('appends the fixed disclaimer only once across two disclaimer-bearing attachments', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER),
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'y' }], DISCLAIMER),
    ]);
    expect(anchorCount(readText(parts[0]), STATIC_MESSAGE)).toBe(1);
  });

  it('is a no-op when no attachment carries a disclaimer', () => {
    const original = 'Here is the answer.';
    const parts = [textPart(original)];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'afr_search_news', serverName: 'afr', content: OTHER_ARTICLE }]),
    ]);
    expect(readText(parts[0])).toBe(original);
  });

  it('appends the fixed KX disclaimer when a DPN source is present', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(parts, [
      mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], undefined, true),
    ]);
    const text = readText(parts[0]);
    expect(text).toContain(STATIC_MESSAGE);
    expect(text).not.toContain('DPN profiles');
  });

  it('appends the fixed disclaimer only once when a turn has both quals and DPN sources', () => {
    const parts = [textPart('Here is the answer.')];
    appendMCPDisclaimers(
      parts,
      [mcpAttachment([{ toolName: 'kx_query', serverName: 'kx', content: 'x' }], DISCLAIMER, true)],
      'https://resources.deloitte.com/sites/kx/usage-guidelines',
    );
    const text = readText(parts[0]);
    expect(text).toContain(
      '[KX usage guidelines](https://resources.deloitte.com/sites/kx/usage-guidelines)',
    );
    expect(anchorCount(text, STATIC_MESSAGE)).toBe(1);
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

  it('matches different inflections of the same fact for web search citations, the same as MCP', () => {
    const parts = [textPart(sentence)];
    insertWebSearchCitations(parts, [
      webSearchAttachment(0, [{ title: 'Central Bank Update', snippet: passageContent }]),
    ]);
    expect(readText(parts[0])).toContain(`${MARKER}turn0search0`);
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

  it('leaves a microsite reply entirely uncited when every matching sentence sits inside the artifact fence', async () => {
    const original = [
      "Here's your microsite based on the two documents!",
      '',
      ':::artifact{identifier="microsite" type="text/html" title="Microsite"}',
      '````',
      'You can reserve a desk fourteen days in advance.',
      'Meeting rooms are booked via the calendar system.',
      '````',
      ':::',
    ].join('\n');
    const parts = [textPart(original)];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          fileSearchAttachment([
            { fileId: 'fileA', content: DESK_CONTENT },
            { fileId: 'fileB', content: MEETING_CONTENT },
          ]),
        ),
      ],
      fileCitations: true,
    });
    expect(readText(parts[0])).toBe(original);
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

  it('still inserts web search citations when fileCitations is false', async () => {
    // `fileCitations` is the file-search-specific citations permission. web_search has no
    // model-generated citation fallback to fall back on, so it must not go silently uncited
    // whenever an admin disables file citations alone.
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(webSearchAttachment(0, [{ title: 'Desk Booking', snippet: DESK_CONTENT }])),
      ],
      fileCitations: false,
    });
    expect(readText(parts[0])).toContain(`${MARKER}turn0search0`);
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

  it('inserts web search anchors when only a web_search attachment is present', async () => {
    const parts = [textPart('You can reserve a desk fourteen days in advance.')];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(webSearchAttachment(0, [{ title: 'Desk Booking', snippet: DESK_CONTENT }])),
      ],
      fileCitations: true,
    });
    expect(readText(parts[0])).toContain(`${MARKER}turn0search0`);
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
    const staticMessage = 'Please note that this response uses data from the KX and DPN Connector.';
    expect(text).toContain(`${MARKER}turn0mcp0`);
    expect(text).toContain(staticMessage);
    expect(text).toContain(
      '[KX usage guidelines](https://resources.deloitte.com/sites/kx/usage-guidelines)',
    );
    expect(text.indexOf(`${MARKER}turn0mcp0`)).toBeLessThan(text.indexOf(staticMessage));
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

  it('does not force-append a citation when a SharePoint listing source is mentioned only inside an artifact fence', async () => {
    const original = [
      "Here's the file you asked about.",
      '',
      ':::artifact{identifier="listing" type="text/markdown" title="Listing"}',
      '````',
      '- GFS_style-guide.pptx',
      '````',
      ':::',
    ].join('\n');
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
              content: 'GFS_style-guide.pptx',
            },
          ]),
        ),
      ],
      fileCitations: true,
    });
    expect(readText(parts[0])).toBe(original);
  });

  it('does not force-append a citation when a disclaimer-bearing MCP source is matched only inside an artifact fence', async () => {
    const original = [
      "Here's a summary.",
      '',
      ':::artifact{identifier="rates-summary" type="text/markdown" title="Rates Summary"}',
      '````',
      AFR_ARTICLE,
      '````',
      ':::',
    ].join('\n');
    const parts = [textPart(original)];
    await applyEndOfTraceCitations({
      contentParts: parts,
      artifactPromises: [
        Promise.resolve(
          mcpAttachment(
            [{ toolName: 'kx_search', serverName: 'kx', content: AFR_ARTICLE }],
            'This information may not be current.',
          ),
        ),
      ],
      fileCitations: true,
    });
    const text = readText(parts[0]);
    expect(anchorCount(text, MARKER)).toBe(0);
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
