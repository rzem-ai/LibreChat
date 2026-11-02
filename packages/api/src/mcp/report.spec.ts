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

  it('cites a section with a non-200, non-error status code (e.g. 206)', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'industryoutlook',
            StatusCode: 206,
            Body: { IndustryOutlook: { PlainText: 'Partial content is still worth citing.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].content).toContain('Partial content is still worth citing.');
  });

  it('cites a section with no status code at all', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'industryoutlook',
            Body: { IndustryOutlook: { PlainText: 'No status code was provided.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].content).toContain('No status code was provided.');
  });

  it('skips sections with an error status code (>= 400)', () => {
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

  // Deloitte Custom Change: verify PublicationDate is surfaced as `date` instead of its own citation.
  it('surfaces a Body-wrapped PublicationDate as the date field on every section, without its own citation', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'publicationdate',
            StatusCode: 200,
            Body: { PublicationDate: '2026-06-24T00:00:00' },
          },
          {
            RequestedSection: 'industryoutlook',
            StatusCode: 200,
            Body: { IndustryOutlook: { PlainText: 'Revenue is forecast to grow.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
    expect(result?.sources.some((source) => source.title === 'Publication Date')).toBe(false);
  });

  // Deloitte Custom Change: verify the flat-shape (non-Body-wrapped) PublicationDate path too.
  it('surfaces a flat-shape PublicationDate as the date field on every section', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_full_report',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          { PublicationDate: '2026-06-24T00:00:00' },
          { Definition: { PlainText: 'This industry mines gold ore.' } },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
  });

  // Deloitte Custom Change: cover the approved-date fallback for reports with invalid publication metadata.
  it('falls back to LastApprovedDate when a report has no usable PublicationDate', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_full_report',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          { PublicationDate: 'not a date' },
          { LastApprovedDate: '2026-06-24T00:00:00' },
          { Definition: { PlainText: 'This industry mines gold ore.' } },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
  });

  // Deloitte Custom Change: cover the nested date shape returned by full-report metadata.
  it('reads a nested PublishedDate.Date from a report section', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          { RequestedSection: 'publicationdate', Body: { PublishedDate: { Date: '2026-06-24' } } },
          {
            RequestedSection: 'definition',
            Body: { Definition: { PlainText: 'This industry mines gold ore.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
  });

  // Deloitte Custom Change: handle a gateway that returns the date as the publication section body itself.
  it('reads a bare date from the requested publicationdate section', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          { RequestedSection: 'publicationdate', Body: '2026-06-24' },
          {
            RequestedSection: 'definition',
            Body: { Definition: { PlainText: 'This industry mines gold ore.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
  });

  // Deloitte Custom Change: verify an error-status PublicationDate section is ignored, just like the main loop ignores it for citations.
  it('ignores a PublicationDate from an error-status section, falling back to a later valid one', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'publicationdate',
            StatusCode: 500,
            Body: { PublicationDate: '2020-01-01T00:00:00' },
          },
          {
            RequestedSection: 'publicationdate',
            StatusCode: 200,
            Body: { PublicationDate: '2026-06-24T00:00:00' },
          },
          {
            RequestedSection: 'industryoutlook',
            StatusCode: 200,
            Body: { IndustryOutlook: { PlainText: 'Revenue is forecast to grow.' } },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].date).toBe('24 Jun 2026');
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

  // Deloitte Custom Change: verify the new top-level array report-list payload handling.
  it('splits a top-level array payload (e.g. ibisworld_list_reports) into one source per report', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([
        { Code: '56162', Title: 'Gold Ore Mining', Country: 'AU' },
        { Code: '11111', Title: 'Test Report', Country: 'US' },
      ]),
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      title: 'Gold Ore Mining',
      link: 'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
    });
    expect(result?.sources[0].content).toContain('56162');
    expect(result?.sources[1]).toMatchObject({
      title: 'Test Report',
      link: 'https://my.ibisworld.com/us/en/industry-specialized/11111/at-a-glance',
    });
  });

  // Deloitte Custom Change: cover date aliases and nested report-list date values.
  it('adds a publication date to report-list citations and falls back to LastApprovedDate', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([
        {
          Code: '56162',
          Title: 'Gold Ore Mining',
          PublicationDate: '2026-06-24T00:00:00',
          LastApprovedDate: '2026-01-01T00:00:00',
        },
        {
          Code: '11111',
          Title: 'Test Report',
          PublicationDate: 'not a date',
          LastApprovedDate: '2025-11-06T00:00:00',
        },
        {
          Code: '22222',
          Title: 'Another Report',
          PublishedDate: { Date: '2024-01-30T00:00:00' },
        },
      ]),
    });

    expect(result?.sources[0].date).toBe('24 Jun 2026');
    expect(result?.sources[1].date).toBe('06 Nov 2025');
    expect(result?.sources[2].date).toBe('30 Jan 2024');
  });

  // Deloitte Custom Change: boolean leaf fields must survive formatting, not silently disappear.
  it('includes boolean leaf fields in a report-list entry content', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([{ Code: '56162', Title: 'Gold Ore Mining', IsPremium: true }]),
    });

    expect(result?.sources[0].content).toContain('IsPremium: true');
  });

  // Deloitte Custom Change: verify the Report-code title fallback for a Title-less list entry.
  it('falls back to a Report-code title when a list entry has no Title', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([{ Code: '56162', Country: 'AU' }]),
    });

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0]).toMatchObject({ title: 'Report 56162' });
  });

  it('skips a report-list entry with usable content but no resolvable Title or Code', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([{ LastApprovedDate: '2009-04-24T21:15:04.683' }]),
    });

    expect(result).toBeUndefined();
  });

  // Deloitte Custom Change: verify link resolution from `args` for Sections-wrapped reports.
  it('populates link on every Sections-wrapped source when args carry code/country', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
      args: { code: '56162', country: 'AU' },
    });

    expect(result?.sources).toHaveLength(2);
    for (const source of result?.sources ?? []) {
      expect(source.link).toBe(
        'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
      );
    }
  });

  // Deloitte Custom Change: verify resolveMCPSourceLink's all-or-nothing placeholder behavior surfaces here too.
  it('leaves link undefined when args are missing or incomplete', () => {
    const noArgsResult = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
    });
    expect(noArgsResult?.sources[0].link).toBeUndefined();

    const partialArgsResult = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
      args: { code: '56162' },
    });
    expect(partialArgsResult?.sources[0].link).toBeUndefined();
  });

  // Deloitte Custom Change: blank/whitespace-only strings and non-finite numbers must not produce a malformed link.
  it('leaves link undefined when args carry blank or non-finite code/country', () => {
    const blankStringResult = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
      args: { code: '   ', country: '  ' },
    });
    expect(blankStringResult?.sources[0].link).toBeUndefined();

    const nonFiniteCodeResult = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: REPORT_PAYLOAD,
      args: { code: NaN, country: 'AU' },
    });
    expect(nonFiniteCodeResult?.sources[0].link).toBeUndefined();
  });

  it('parses a flat Sections shape with no Body wrapper (e.g. ibisworld_full_report)', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_full_report',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          { Code: '56162' },
          { Title: 'Gold Ore Mining in Australia' },
          { Author: 'Jane Analyst' },
          {
            Definition: {
              PlainText: 'This industry mines gold ore.',
            },
          },
          {
            RelatedIndustries: [
              { Code: '12345', Title: 'Related Industry One' },
              { Code: '67890', Title: 'Related Industry Two' },
            ],
          },
          {
            Highlights: [{ Highlight: 'Revenue', Year: 2025, Value: 37858.2, Unit: '$ million' }],
          },
        ],
      }),
      args: { code: '56162', country: 'AU' },
    });

    expect(result?.sources).toHaveLength(6);
    expect(result?.sources.every((source) => source.link != null)).toBe(true);
    expect(result?.sources[0]).toMatchObject({
      title: 'Gold Ore Mining in Australia: Code',
      content: expect.stringContaining('56162'),
    });
    expect(result?.sources[1]).toMatchObject({ title: 'Gold Ore Mining in Australia' });
    expect(result?.sources[1].content).toContain('Gold Ore Mining in Australia');
    expect(result?.sources[3]).toMatchObject({ title: 'Gold Ore Mining in Australia: Definition' });
    expect(result?.sources[3].content).toContain('This industry mines gold ore.');
    expect(result?.sources[4].content).toContain('Related Industry One');
    expect(result?.sources[4].content).toContain('Related Industry Two');
    expect(result?.sources[5].content).toContain('Revenue: 37858.2 $ million (2025)');
  });

  // Deloitte Custom Change: verify extractReportTitle's report-title prefix on other sections' citations.
  it('prefixes every section title with the report title when a Title section is present', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({
        Sections: [
          {
            RequestedSection: 'title',
            StatusCode: 200,
            Body: { Title: 'Finance in Australia' },
          },
          {
            RequestedSection: 'outlookanalysis',
            StatusCode: 200,
            Body: {
              OutlookAnalysis: [
                {
                  Headline: 'Big Four will accelerate tech investments',
                  Analysis: [{ PlainText: 'Investments in technology are set to escalate.' }],
                },
              ],
            },
          },
        ],
      }),
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({ title: 'Finance in Australia' });
    expect(result?.sources[1]).toMatchObject({
      title: 'Finance in Australia: Outlook Analysis',
    });
    expect(result?.sources[1].content).toContain('Big Four will accelerate tech investments');
  });

  // Deloitte Custom Change: verify the MAX_REPORT_LIST_ITEMS cap on report-list payloads.
  it('caps a report list payload at 30 sources', () => {
    const items = Array.from({ length: 35 }, (_, i) => ({ Code: `${i}`, Title: `Report ${i}` }));
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify(items),
    });

    expect(result?.sources).toHaveLength(30);
  });

  it('returns undefined for a report list payload with no usable fields', () => {
    const result = buildReportSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify([{}, null]),
    });

    expect(result).toBeUndefined();
  });
});
