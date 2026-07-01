import { extractRetrievalSources } from './retrieval';

describe('extractRetrievalSources', () => {
  it('returns empty array for empty input', () => {
    expect(extractRetrievalSources([])).toEqual([]);
  });

  it('skips null and non-object entries', () => {
    expect(extractRetrievalSources([null, undefined, 'string', 42])).toEqual([]);
  });

  it('skips attachments without type file_search', () => {
    const attachment = { type: 'web_search', web_search: { sources: [{ content: 'x' }] } };
    expect(extractRetrievalSources([attachment])).toEqual([]);
  });

  it('skips file_search attachments with missing or non-array sources', () => {
    expect(extractRetrievalSources([{ type: 'file_search', file_search: {} }])).toEqual([]);
    expect(
      extractRetrievalSources([{ type: 'file_search', file_search: { sources: null } }]),
    ).toEqual([]);
  });

  it('extracts sources from a single file_search attachment', () => {
    const attachment = {
      type: 'file_search',
      file_search: {
        sources: [
          {
            fileId: 'file_123',
            fileName: 'example.pdf',
            pages: [5],
            relevance: 0.85,
            content: 'This is the retrieved content',
          },
        ],
      },
    };
    expect(extractRetrievalSources([attachment])).toEqual([
      {
        content: 'This is the retrieved content',
        fileName: 'example.pdf',
        fileId: 'file_123',
        relevance: 0.85,
        pages: [5],
      },
    ]);
  });

  it('flattens sources across multiple file_search attachments', () => {
    const attachments = [
      {
        type: 'file_search',
        file_search: {
          sources: [
            { fileId: 'file_1', fileName: 'a.pdf', pages: [], relevance: 0.9, content: 'chunk a' },
          ],
        },
      },
      {
        type: 'file_search',
        file_search: {
          sources: [
            { fileId: 'file_2', fileName: 'b.pdf', pages: [1], relevance: 0.6, content: 'chunk b' },
          ],
        },
      },
    ];
    const result = extractRetrievalSources(attachments);
    expect(result).toHaveLength(2);
    expect(result[0].fileId).toBe('file_1');
    expect(result[1].fileId).toBe('file_2');
  });

  it('handles multiple sources in one attachment', () => {
    const attachment = {
      type: 'file_search',
      file_search: {
        sources: [
          { fileId: 'f1', fileName: 'doc.txt', pages: [], relevance: 0.8, content: 'first' },
          { fileId: 'f1', fileName: 'doc.txt', pages: [2], relevance: 0.7, content: 'second' },
        ],
      },
    };
    expect(extractRetrievalSources([attachment])).toHaveLength(2);
  });

  it('applies safe defaults for missing or wrong-typed source fields', () => {
    const attachment = {
      type: 'file_search',
      file_search: {
        sources: [{ fileId: 42, fileName: null, pages: 'wrong', relevance: 'high', content: 123 }],
      },
    };
    expect(extractRetrievalSources([attachment])).toEqual([
      { content: '', fileName: '', fileId: '', relevance: 0, pages: [] },
    ]);
  });

  it('skips null entries within the sources array', () => {
    const attachment = {
      type: 'file_search',
      file_search: {
        sources: [
          null,
          { fileId: 'f1', fileName: 'ok.pdf', pages: [], relevance: 0.75, content: 'good' },
        ],
      },
    };
    expect(extractRetrievalSources([attachment])).toHaveLength(1);
    expect(extractRetrievalSources([attachment])[0].fileId).toBe('f1');
  });

  it('ignores non-file_search attachments alongside valid ones', () => {
    const attachments = [
      { type: 'other', data: {} },
      {
        type: 'file_search',
        file_search: {
          sources: [
            { fileId: 'f1', fileName: 'report.pdf', pages: [], relevance: 0.88, content: 'data' },
          ],
        },
      },
    ];
    const result = extractRetrievalSources(attachments);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('report.pdf');
  });
});
