import { buildReportSources } from './report';

const REPORT_PAYLOAD = JSON.stringify({
  Sections: [
    {
      RequestedSection: 'executivesummaryanalysis',
      StatusCode: 200,
      Body: {
        ExecutiveSummaryAnalysis: {
          PlainText:
            "Australia's gold ore miners have performed well over the past few years thanks to skyrocketing gold prices.",
        },
      },
    },
    {
      RequestedSection: 'industryoutlook',
      StatusCode: 200,
      Body: {
        IndustryOutlook: {
          PlainText: 'Revenue is forecast to grow over the next five years.',
        },
      },
    },
    {
      RequestedSection: 'keystatistics',
      StatusCode: 500,
      Body: {
        KeyStatistics: {
          PlainText: 'This section failed and must not be cited.',
        },
      },
    },
  ],
});

describe('buildReportSources', () => {
  it('splits a Sections report payload into one source per successful section', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Executive Summary Analysis',
    });
    expect(result?.sources[0].content).toContain('Executive Summary Analysis');
    expect(result?.sources[0].content).toContain('gold ore miners');
    expect(result?.sources[1]).toMatchObject({ title: 'Industry Outlook' });
  });

  it('skips sections with a non-200 status code', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
    });

    expect(result?.sources.some((source) => source.content.includes('must not be cited'))).toBe(
      false,
    );
  });

  it('returns undefined for JSON that is not a Sections report', () => {
    const result = buildReportSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    const result = buildReportSources({
      toolName: 'broken',
      serverName: 'broken',
      content: '{ "Sections": [',
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when no section has usable PlainText', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [{ RequestedSection: 'empty', StatusCode: 200, Body: { Empty: {} } }],
      }),
    });

    expect(result).toBeUndefined();
  });

  it('renders a SWOT section as a bulleted list per category', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'swot',
            StatusCode: 200,
            Body: {
              SWOT: {
                Strengths: ['Low Imports', 'Low Capital Requirements'],
                Weaknesses: ['High Competition'],
                Opportunities: [],
                Threats: ['Low Revenue Growth (2026-2031)'],
              },
            },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'SWOT' });
    expect(result?.sources[0].content).toContain(
      'Strengths:\n- Low Imports\n- Low Capital Requirements',
    );
    expect(result?.sources[0].content).toContain('Weaknesses:\n- High Competition');
    expect(result?.sources[0].content).toContain('Threats:\n- Low Revenue Growth (2026-2031)');
    expect(result?.sources[0].content).not.toContain('Opportunities:');
  });

  it('renders a KeyStatistics section as latest-year value lines', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'keystatistics',
            StatusCode: 200,
            Body: {
              KeyStatistics: [
                {
                  Caption: 'Revenue',
                  Unit: '$ million',
                  Years: [
                    { Year: 2024, CurrentValue: 29105.2 },
                    { Year: 2025, CurrentValue: 37858.2 },
                  ],
                },
                { Caption: 'Empty Statistic', Unit: '%', Years: [] },
              ],
            },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Key Statistics' });
    expect(result?.sources[0].content).toContain('Revenue: 37858.2 $ million (2025)');
    expect(result?.sources[0].content).not.toContain('Empty Statistic');
  });

  it('renders an OutlookAnalysis section as headline plus joined analysis text', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'outlookanalysis',
            StatusCode: 200,
            Body: {
              OutlookAnalysis: [
                {
                  Headline: 'Geopolitical tensions will support gold demand',
                  Analysis: [
                    { PlainText: 'Gold prices are projected to fall over the next few years.' },
                    { PlainText: 'Elevated real bond yields threaten investor demand.' },
                  ],
                },
              ],
            },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Outlook Analysis' });
    expect(result?.sources[0].content).toContain('Geopolitical tensions will support gold demand');
    expect(result?.sources[0].content).toContain('Gold prices are projected to fall');
    expect(result?.sources[0].content).toContain(
      'Elevated real bond yields threaten investor demand',
    );
  });

  it('renders a Highlights section as latest-year value lines', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'highlights',
            StatusCode: 200,
            Body: {
              Highlights: [
                { Highlight: 'Revenue', Year: 2025, Value: 37858.2, Unit: '$ million' },
                { Highlight: 'Employment', Year: 2025, Value: 22196, Unit: 'Units' },
                { Value: 0, Unit: '%' },
              ],
            },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Highlights' });
    expect(result?.sources[0].content).toContain('Revenue: 37858.2 $ million (2025)');
    expect(result?.sources[0].content).toContain('Employment: 22196 Units (2025)');
  });
});
