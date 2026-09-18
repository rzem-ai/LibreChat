import { resolveMCPSourceLink } from './linkTemplates';

describe('resolveMCPSourceLink', () => {
  it('returns undefined when no template prefix matches the tool name', () => {
    const result = resolveMCPSourceLink('afr_search_news', { id: '123' }, [
      { prefix: 'desc_', template: 'https://example.com/entities/{id}' },
    ]);

    expect(result).toBeUndefined();
  });

  it('substitutes a single placeholder from the matched template', () => {
    const result = resolveMCPSourceLink('desc_get_entity_by_id', { entityID: 127914 }, [
      { prefix: 'desc_', template: 'https://example.com/entities/{entityID}' },
    ]);

    expect(result).toBe('https://example.com/entities/127914');
  });

  it('substitutes multiple placeholders, mirroring a code+country template', () => {
    const result = resolveMCPSourceLink('ibisworld_full_report', { code: '56162', country: 'au' }, [
      {
        prefix: 'ibisworld_',
        template: 'https://my.ibisworld.com/{country}/en/industry-specialized/{code}/at-a-glance',
      },
    ]);

    expect(result).toBe('https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance');
  });

  it('returns undefined when a required placeholder field is missing', () => {
    const result = resolveMCPSourceLink('ibisworld_full_report', { code: '56162' }, [
      {
        prefix: 'ibisworld_',
        template: 'https://my.ibisworld.com/{country}/en/industry-specialized/{code}/at-a-glance',
      },
    ]);

    expect(result).toBeUndefined();
  });

  it('returns undefined when a required placeholder field is an empty or whitespace-only string', () => {
    const result = resolveMCPSourceLink(
      'ibisworld_full_report',
      { code: '56162', country: '   ' },
      [
        {
          prefix: 'ibisworld_',
          template: 'https://my.ibisworld.com/{country}/en/industry-specialized/{code}/at-a-glance',
        },
      ],
    );

    expect(result).toBeUndefined();
  });

  it('returns undefined when a required placeholder field is a non-finite number', () => {
    const result = resolveMCPSourceLink('ibisworld_full_report', { code: NaN, country: 'au' }, [
      {
        prefix: 'ibisworld_',
        template: 'https://my.ibisworld.com/{country}/en/industry-specialized/{code}/at-a-glance',
      },
    ]);

    expect(result).toBeUndefined();
  });

  it('URL-encodes substituted field values', () => {
    const result = resolveMCPSourceLink('desc_search_entities', { name: 'Acme & Co' }, [
      { prefix: 'desc_', template: 'https://example.com/entities?name={name}' },
    ]);

    expect(result).toBe('https://example.com/entities?name=Acme%20%26%20Co');
  });
});
