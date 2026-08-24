import { buildKxSources } from './kx';

describe('buildKxSources', () => {
  it('splits a KX people-search payload into one source per profile', () => {
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
