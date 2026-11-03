import { createRagUploadSearch } from '../../src/server/uploads';

describe('createRagUploadSearch', () => {
  it('queries each file as the user and returns the closest chunks first', async () => {
    const post = jest.fn(async (_url: string, body: { file_id: string }) => ({
      data:
        body.file_id === 'f1'
          ? [
              [{ page_content: 'far chunk', metadata: { source: '/u/a.pdf', page: 2 } }, 0.9],
              [{ page_content: 'near chunk', metadata: { source: '/u/a.pdf', page: 1 } }, 0.1],
            ]
          : [[{ page_content: 'middle chunk', metadata: { source: '/u/b.docx' } }, 0.5]],
    }));
    const search = createRagUploadSearch({
      ragApiUrl: 'http://rag:8000',
      httpClient: { post },
      generateShortLivedToken: (userId) => `token-for-${userId}`,
      maxHits: 2,
    });

    const hits = await search.search({ userId: 'u1', fileIds: ['f1', 'f2'], query: 'retention' });

    expect(post).toHaveBeenCalledWith(
      'http://rag:8000/query',
      { file_id: 'f1', query: 'retention', k: 5 },
      expect.objectContaining({ headers: { Authorization: 'Bearer token-for-u1' } }),
    );
    expect(hits).toEqual([
      { fileId: 'f1', filename: 'a.pdf', page: 1, content: 'near chunk', distance: 0.1 },
      { fileId: 'f2', filename: 'b.docx', content: 'middle chunk', distance: 0.5 },
    ]);
  });

  it('skips a file whose query fails and keeps the rest', async () => {
    const post = jest.fn(async (_url: string, body: { file_id: string }) => {
      if (body.file_id === 'bad') {
        throw new Error('rag down');
      }
      return { data: [[{ page_content: 'ok', metadata: { source: 'c.txt' } }, 0.2]] };
    });
    const search = createRagUploadSearch({
      ragApiUrl: 'http://rag:8000',
      httpClient: { post },
      generateShortLivedToken: () => 't',
    });
    const hits = await search.search({ userId: 'u1', fileIds: ['bad', 'good'], query: 'q' });
    expect(hits.map((h) => h.fileId)).toEqual(['good']);
  });

  it('returns nothing without files or a query, and without calling the API', async () => {
    const post = jest.fn();
    const search = createRagUploadSearch({
      ragApiUrl: 'http://rag:8000',
      httpClient: { post },
      generateShortLivedToken: () => 't',
    });
    expect(await search.search({ userId: 'u1', fileIds: [], query: 'q' })).toEqual([]);
    expect(await search.search({ userId: 'u1', fileIds: ['f1'], query: '  ' })).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
});
