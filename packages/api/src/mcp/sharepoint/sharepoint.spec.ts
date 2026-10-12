import { buildSharePointSources } from './sharepoint';

describe('buildSharePointSources', () => {
  it('splits an sp_search response into one source per hit', () => {
    const content = JSON.stringify({
      results: [
        {
          rank: 1,
          summary: 'Q3 budget summary for the finance team.',
          resource: {
            name: 'Q3 Budget.xlsx',
            webUrl: 'https://contoso.sharepoint.com/sites/finance/Q3%20Budget.xlsx',
          },
        },
        {
          rank: 2,
          summary: 'Roadmap notes.',
          resource: {
            name: 'Roadmap.docx',
            webUrl: 'https://contoso.sharepoint.com/sites/finance/Roadmap.docx',
          },
        },
      ],
      total: 2,
      hasMore: false,
    });

    const result = buildSharePointSources({
      toolName: 'sp_search',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      toolName: 'sp_search',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      title: 'Q3 Budget.xlsx',
      link: 'https://contoso.sharepoint.com/sites/finance/Q3%20Budget.xlsx',
    });
    expect(result?.sources[0].content).toContain('Q3 budget summary for the finance team.');
    expect(result?.sources[1]).toMatchObject({ title: 'Roadmap.docx' });
  });

  it('skips search hits with no resource name', () => {
    const content = JSON.stringify({
      results: [{ rank: 1, summary: 'No name here', resource: { webUrl: 'https://x' } }],
      total: 1,
    });

    const result = buildSharePointSources({
      toolName: 'sp_search',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result).toBeUndefined();
  });

  it('splits an sp_list_items response into one source per item', () => {
    const content = JSON.stringify({
      items: [
        {
          id: '1',
          name: 'Report.pdf',
          size: 1024,
          type: 'file',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/Report.pdf',
          parentPath: '/drives/abc/root:/Finance',
        },
        {
          id: '2',
          name: 'Archive',
          type: 'folder',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/Archive',
        },
      ],
      count: 2,
    });

    const result = buildSharePointSources({
      toolName: 'sp_list_items',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      title: 'Report.pdf',
      link: 'https://contoso.sharepoint.com/sites/finance/Report.pdf',
    });
    expect(result?.sources[0].content).toContain('/drives/abc/root:/Finance');
    expect(result?.sources[1]).toMatchObject({ title: 'Archive' });
  });

  it('splits an sp_list_sites response into one source per site using displayName', () => {
    const content = JSON.stringify({
      sites: [
        {
          id: 'contoso.sharepoint.com,guid,guid',
          displayName: 'Finance Team Site',
          webUrl: 'https://contoso.sharepoint.com/sites/finance',
          description: 'Site for the finance team.',
        },
      ],
    });

    const result = buildSharePointSources({
      toolName: 'sp_list_sites',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({
      title: 'Finance Team Site',
      link: 'https://contoso.sharepoint.com/sites/finance',
    });
    expect(result?.sources[0].content).toContain('Site for the finance team.');
  });

  it('builds a single source for an sp_get_item-style bare object payload', () => {
    const content = JSON.stringify({
      id: '1',
      name: 'Report.pdf',
      webUrl: 'https://contoso.sharepoint.com/sites/finance/Report.pdf',
    });

    const result = buildSharePointSources({
      toolName: 'sp_get_item',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Report.pdf' });
  });

  it('builds a source carrying full file content for an sp_read_file-style payload', () => {
    const content = JSON.stringify({
      name: 'Anthropic_Claude_Certification_Guide.docx',
      webUrl:
        'https://contoso.sharepoint.com/sites/finance/Anthropic_Claude_Certification_Guide.docx',
      content:
        '# Anthropic Claude Certification Guide\n\nClaude Certified Associate – Foundations (CCAO-F)...',
    });

    const result = buildSharePointSources({
      toolName: 'sp_read_file',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({
      title: 'Anthropic_Claude_Certification_Guide.docx',
      link: 'https://contoso.sharepoint.com/sites/finance/Anthropic_Claude_Certification_Guide.docx',
    });
    expect(result?.sources[0].content).toContain(
      'Claude Certified Associate – Foundations (CCAO-F)',
    );
  });

  // Deloitte Custom Change: verify the new `date` field's 3-way timestamp fallback chain.
  it('prefers createdDateTime, falling back to lastModifiedDateTime then lastModified', () => {
    const content = JSON.stringify({
      items: [
        {
          name: 'Both dates present.pdf',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/a.pdf',
          createdDateTime: '2026-01-05T00:00:00Z',
          lastModifiedDateTime: '2026-02-05T00:00:00Z',
        },
        {
          name: 'Only lastModifiedDateTime.pdf',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/b.pdf',
          lastModifiedDateTime: '2026-03-05T00:00:00Z',
        },
        {
          name: 'Copy of GreenSheet[31].xlsx',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/c.xlsx',
          lastModified: '2026-04-05T00:00:00Z',
        },
        {
          name: 'No date at all.pdf',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/d.pdf',
        },
      ],
    });

    const result = buildSharePointSources({
      toolName: 'sp_list_files',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources[0].date).toBe('05 Jan 2026');
    expect(result?.sources[1].date).toBe('05 Mar 2026');
    expect(result?.sources[2].date).toBe('05 Apr 2026');
    expect(result?.sources[3].date).toBeUndefined();
  });

  it('returns undefined for an empty list result', () => {
    const content = JSON.stringify({ items: [], count: 0 });

    const result = buildSharePointSources({
      toolName: 'sp_list_items',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for JSON that is not a SharePoint payload', () => {
    const result = buildSharePointSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    const result = buildSharePointSources({
      toolName: 'broken',
      serverName: 'broken',
      content: '{ "items": [',
    });

    expect(result).toBeUndefined();
  });

  it('salvages an sp_read_file payload preceded by a plain-text fallback notice', () => {
    const jsonPayload = JSON.stringify({
      name: 'Microsoft MTG.docx',
      webUrl: 'https://contoso.sharepoint.com/sites/finance/Microsoft%20MTG.docx',
      content: '# Microsoft MTG\n\nKey stakeholders: {Central Identity & Security Engineering}...',
    });
    const content = [
      'I was unable to read the file as a text file. I will try to read it again, converting it to markdown format.',
      jsonPayload,
    ].join('\n');

    const result = buildSharePointSources({
      toolName: 'sp_read_file',
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({
      title: 'Microsoft MTG.docx',
      link: 'https://contoso.sharepoint.com/sites/finance/Microsoft%20MTG.docx',
    });
    expect(result?.sources[0].content).toContain('Central Identity & Security Engineering');
  });
});
