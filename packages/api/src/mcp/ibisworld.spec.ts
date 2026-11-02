import { withPublicationDateSection } from './ibisworld';

// Deloitte Custom Change: cover forced publication-date metadata on IBISWorld section calls.
describe('withPublicationDateSection', () => {
  it('adds publicationdate to an IBISWorld report section request', () => {
    const toolArguments = { code: '56162', country: 'AU', sections: ['outlookanalysis'] };

    expect(withPublicationDateSection('ibisworld_report_sections', toolArguments)).toEqual({
      ...toolArguments,
      sections: ['outlookanalysis', 'publicationdate'],
    });
    expect(toolArguments.sections).toEqual(['outlookanalysis']);
  });

  it('does not duplicate an already requested publication date', () => {
    const toolArguments = { sections: ['title', ' PublicationDate '] };

    expect(withPublicationDateSection('ibisworld_report_sections', toolArguments)).toBe(
      toolArguments,
    );
  });

  it('leaves other tools and malformed section arguments unchanged', () => {
    const toolArguments = { sections: ['outlookanalysis'] };

    expect(withPublicationDateSection('ibisworld_full_report', toolArguments)).toBe(toolArguments);
    expect(withPublicationDateSection('ibisworld_report_sections', undefined)).toBeUndefined();
    expect(
      withPublicationDateSection('ibisworld_report_sections', { sections: 'outlookanalysis' }),
    ).toEqual({ sections: 'outlookanalysis' });
  });
});
