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
    const sources = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
    });

    expect(sources).toHaveLength(2);
    expect(sources?.[0]).toMatchObject({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Executive Summary Analysis',
    });
    expect(sources?.[0].content).toContain('Executive Summary Analysis');
    expect(sources?.[0].content).toContain('gold ore miners');
    expect(sources?.[1]).toMatchObject({ title: 'Industry Outlook' });
  });

  it('skips sections with a non-200 status code', () => {
    const sources = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
    });

    expect(sources?.some((source) => source.content.includes('must not be cited'))).toBe(false);
  });

  it('returns undefined for JSON that is not a Sections report', () => {
    const sources = buildReportSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(sources).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    const sources = buildReportSources({
      toolName: 'broken',
      serverName: 'broken',
      content: '{ "Sections": [',
    });

    expect(sources).toBeUndefined();
  });

  it('returns undefined when no section has usable PlainText', () => {
    const sources = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [{ RequestedSection: 'empty', StatusCode: 200, Body: { Empty: {} } }],
      }),
    });

    expect(sources).toBeUndefined();
  });
});
