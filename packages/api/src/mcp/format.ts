export { formatDisplayDate } from 'librechat-data-provider';

/** Strips HTML tags/entities down to plain text, collapsing whitespace. */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts `<a href="URL">TEXT</a>` anchors (optionally wrapped in a `<cit>`
 * tag, as returned by KX's `usage_guidelines` field) into markdown
 * `[TEXT](URL)` links, then strips any remaining HTML tags. Unlike
 * {@link stripHtmlTags}, this preserves links as clickable markdown instead
 * of discarding them, since the result is destined for a markdown-rendered
 * answer rather than a plain-text citation snippet.
 */
export function htmlToMarkdownText(html: string): string {
  const withMarkdownLinks = html.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
    (_match, href: string, text: string) => `[${text}](${href})`,
  );
  return stripHtmlTags(withMarkdownLinks);
}
