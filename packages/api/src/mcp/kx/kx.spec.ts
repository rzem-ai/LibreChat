import { buildKxSources, DPN_USAGE_GUIDELINES_URL } from './kx';

describe('buildKxSources', () => {
  it('splits a KX people-search payload into one source per profile, flagging DPN results for the usage-restriction warning', () => {
    const content = JSON.stringify({
      summary: 'The following professionals show experience...',
      actualresults: [
        {
          _id: 1327466,
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
          source: 'DPN',
          usageguidelines: '',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Decker, Heather',
      link: 'https://stage.people.deloitte/profile/hdecker',
    });
    expect(result?.sources[0].content).toBe(
      'Decker, Heather\n\nInsurance Regulatory & Compliance Practice',
    );
    expect(result?.sources[0].usageRestriction).toBe(true);
    expect(result?.sources[0].usageRestrictionLink).toBe(DPN_USAGE_GUIDELINES_URL);
    expect(result?.dpnUsageRestriction).toBe(true);
  });

  it('strips HTML and surfaces the per-item usage restriction warning for quals', () => {
    const content = JSON.stringify({
      summary: 'Quals matching AI governance...',
      usage_guidelines: 'Please review accuracy of all the responses before reusing them.',
      actualresults: [
        {
          _id: 2744254,
          appid: '139514',
          title: 'Assistance with AI Governance and Responsible AI Ecosystem',
          description:
            '<div>Deloitte helped establish an AI Governance practice.</div><ul><li>Created a Model Inventory</li></ul>',
          appurl: 'https://stagequals.deloitteresources.com/quals/view/139514/description/',
          usageguidelines: 'Requires partner approval for each use',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].content).not.toContain('<div>');
    expect(result?.sources[0].content).not.toContain('<li>');
    expect(result?.sources[0].content).toContain(
      'Deloitte helped establish an AI Governance practice.',
    );
    expect(result?.sources[0].content).toContain(
      'Usage restrictions: Requires partner approval for each use',
    );
    expect(result?.sources[0].usageRestriction).toBe(true);
    expect(result?.sources[0].usageRestrictionLink).toBeUndefined();
    expect(result?.dpnUsageRestriction).toBeUndefined();
  });

  it('surfaces the top-level usage_guidelines disclaimer', () => {
    const content = JSON.stringify({
      usage_guidelines: 'Please review accuracy of all the responses before reusing them.',
      actualresults: [
        {
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.disclaimer).toBe(
      'Please review accuracy of all the responses before reusing them.',
    );
  });

  it('converts <cit><a> markup in the disclaimer to markdown links instead of leaking raw HTML', () => {
    const content = JSON.stringify({
      usage_guidelines:
        'Please review accuracy of all the responses before reusing them. See ' +
        '<cit><a href="https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx" target="_blank">usage guidelines</a></cit> ' +
        'Citations <cit><a href="https://stagequals.deloitteresources.com/quals/view/149189/description/" target="_blank">1</a></cit> have usage restrictions.',
      actualresults: [
        {
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.disclaimer).not.toContain('<cit>');
    expect(result?.disclaimer).not.toContain('<a ');
    expect(result?.disclaimer).toContain(
      '[usage guidelines](https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx)',
    );
    expect(result?.disclaimer).toContain(
      '[1](https://stagequals.deloitteresources.com/quals/view/149189/description/)',
    );
  });

  it('strips HTML from the per-item usage restriction warning, since it renders as plain text', () => {
    const content = JSON.stringify({
      actualresults: [
        {
          title: 'Assistance with AI Governance',
          description: 'Deloitte helped establish an AI Governance practice.',
          appurl: 'https://stagequals.deloitteresources.com/quals/view/139514/description/',
          usageguidelines:
            'Requires <a href="https://example.com">partner approval</a> for each use',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources[0].content).not.toContain('<a ');
    expect(result?.sources[0].content).toContain(
      'Usage restrictions: Requires partner approval for each use',
    );
  });

  it('omits the disclaimer when usage_guidelines is absent', () => {
    const content = JSON.stringify({
      actualresults: [
        {
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.disclaimer).toBeUndefined();
  });

  it('omits the disclaimer when usage_guidelines is an empty string', () => {
    const content = JSON.stringify({
      usage_guidelines: '',
      actualresults: [
        {
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.disclaimer).toBeUndefined();
  });

  it('omits the usage restriction line when usageguidelines is empty', () => {
    const content = JSON.stringify({
      actualresults: [
        {
          title: 'Decker, Heather',
          description: 'Insurance Regulatory & Compliance Practice',
          appurl: 'https://stage.people.deloitte/profile/hdecker',
          usageguidelines: '',
        },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources[0].content).not.toContain('Usage restrictions');
    expect(result?.sources[0].usageRestriction).toBe(false);
  });

  it('skips title-less fragment records so they never render as anonymous chips', () => {
    const content = JSON.stringify({
      actualresults: [
        { title: 'Jotwani, Pavan', description: 'Skills include Selenium (Java/C#), Appium.' },
        { title: '', description: 'Skills include Selenium (Java/C#), Appium.' },
      ],
    });

    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].title).toBe('Jotwani, Pavan');
  });

  it('returns undefined for JSON that is not a KX payload', () => {
    const result = buildKxSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for a non-JSON error response', () => {
    const result = buildKxSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content: 'Error: 422 Unprocessable Entity',
    });

    expect(result).toBeUndefined();
  });
});
