/**
 * Deloitte Custom Change: ensures targeted IBISWorld report-section calls return date metadata.
 * @param toolName The MCP tool name being invoked.
 * @param toolArguments The model-provided MCP arguments, when available.
 * @returns A copied object with `publicationdate` appended when applicable, otherwise the input value unchanged.
 */
export function withPublicationDateSection(
  toolName: string,
  toolArguments: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (toolName !== 'ibisworld_report_sections' || !toolArguments) {
    return toolArguments;
  }

  const requestedSections = toolArguments.sections;
  if (!Array.isArray(requestedSections)) {
    return toolArguments;
  }
  if (
    requestedSections.some(
      (sectionName) =>
        typeof sectionName === 'string' && sectionName.trim().toLowerCase() === 'publicationdate',
    )
  ) {
    return toolArguments;
  }

  return { ...toolArguments, sections: [...requestedSections, 'publicationdate'] };
}
