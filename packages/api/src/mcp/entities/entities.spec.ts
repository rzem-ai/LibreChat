import { buildEntitySources } from './entities';
import * as linkTemplates from '../linkTemplates';

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

  // Deloitte Custom Change: verify the entityID-as-title fallback introduced for entities with no name.
  it('falls back to entityID as the title when entityName is missing', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [{ entityID: 999001 }] },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Entity 999001' });
    expect(result?.sources[0].content).toContain('Entity ID: 999001');
  });

  it('falls back to entityID as the title when entityName is blank or whitespace-only', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [{ entityID: 999002, entityName: '   ' }] },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Entity 999002' });
  });

  it('treats a blank or whitespace-only string entityID as missing', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [{ entityID: '   ', lastApprovedDate: '2009-04-24T21:15:04.683' }] },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result).toBeUndefined();
  });

  it('trims a string entityID before using it as the title fallback', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [{ entityID: '  999003  ' }] },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Entity 999003' });
    expect(result?.sources[0].content).toContain('Entity ID: 999003');
  });

  it('falls back to entityID for a get_entity_by_id-style payload with no entityName', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { entityID: 999001 },
    });

    const result = buildEntitySources({
      toolName: 'desc_get_entity_by_id',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Entity 999001' });
  });

  // Deloitte Custom Change: verify the updated guard still rejects an entity with no identifiable field.
  it('returns undefined for an entity with neither entityID nor entityName', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { items: [{ lastApprovedDate: '2009-04-24T21:15:04.683' }] },
    });

    const result = buildEntitySources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result).toBeUndefined();
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

  // Deloitte Custom Change: verify the new `link` field resolves via resolveMCPSourceLink.
  it('populates link once a matching template is registered for the tool', () => {
    const spy = jest
      .spyOn(linkTemplates, 'resolveMCPSourceLink')
      .mockReturnValue('https://example.com/entities/127914');

    const content = JSON.stringify({
      data: { entityID: 127914, entityName: 'Microsoft NZT Holdings, Inc.' },
    });
    const result = buildEntitySources({
      toolName: 'desc_get_entity_by_id',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources[0]).toMatchObject({ link: 'https://example.com/entities/127914' });
    expect(spy).toHaveBeenCalledWith('desc_get_entity_by_id', { entityID: 127914 });

    spy.mockRestore();
  });
});
