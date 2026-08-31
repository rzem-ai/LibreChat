import { buildEntitySources } from './entities';

describe('buildEntitySources', () => {
  it('splits a DESC/GIMS list payload into one source per entity', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: {
        items: [
          {
            entityID: 127914,
            entityName: 'Microsoft NZT Holdings, Inc.',
            lastApprovedDate: '2009-04-24T21:15:04.683',
          },
          { entityID: 128001, entityName: 'Microsoft Corporation' },
        ],
        totalItems: 918,
        totalPages: 92,
      },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Microsoft NZT Holdings, Inc.',
    });
    expect(result?.sources[0].content).toContain('Entity ID: 127914');
    expect(result?.sources[0].content).toContain('Last approved: 2009-04-24T21:15:04.683');
    expect(result?.sources[1]).toMatchObject({ title: 'Microsoft Corporation' });
    expect(result?.sources[1].content).not.toContain('Last approved');
  });

  it('builds a single source for a get_entity_by_id-style payload', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { entityID: 127914, entityName: 'Microsoft NZT Holdings, Inc.' },
    });

    const result = buildEntitySources({
      toolName: 'desc_get_entity_by_id',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Microsoft NZT Holdings, Inc.' });
  });

  it('returns undefined for an empty GIMS result set', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [], totalItems: 0, totalPages: 0 },
    });

    const result = buildEntitySources({
      toolName: 'gims_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for JSON that is not an entity payload', () => {
    const result = buildEntitySources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    const result = buildEntitySources({
      toolName: 'broken',
      serverName: 'broken',
      content: '{ "data": {',
    });

    expect(result).toBeUndefined();
  });
});
