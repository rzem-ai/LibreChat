import { Tools, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, MCPResultSource } from 'librechat-data-provider';
import { insertFileCitations, insertMCPCitations, applyEndOfTraceCitations } from './citations';

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

function mcpAttachment(sources: MCPResultSource[]): TAttachment {
  return {
    type: Tools.mcp_results,
    messageId: 'msg-1',
    toolCallId: 'call-1',
    conversationId: 'conv-1',
    [Tools.mcp_results]: { sources },
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
});

describe('insertMCPCitations', () => {
  const AFR_ARTICLE =
    'The Reserve Bank held the cash rate steady at its meeting today, citing steady inflation.';
  const OTHER_ARTICLE =
    'Shares in the mining sector rallied after a surprise jump in iron ore prices overseas.';

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
});
