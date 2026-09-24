import { Tools, replaceSpecialVars } from 'librechat-data-provider';

/** Builds the web search tool context with citation format instructions. */
export function buildWebSearchContext(): string {
  return `# \`${Tools.web_search}\`:
Use this tool when the user's request calls for it, whether directly, indirectly, or implicitly, or when answering requires information that is current, real-time, or otherwise beyond your own knowledge; for questions you can answer reliably on your own, respond directly without searching. When searching, execute immediately without preface, then provide a brief summary addressing the query directly, then structure your response with clear Markdown formatting (## headers, lists, tables). Cite sources properly, tailor tone to query type, and provide comprehensive details.

Use the conversation date/time from the dynamic runtime context when recency matters.

Citations for search results and news articles are added automatically after your response — do not add your own anchors, footnotes, or markdown links for them.

**IMAGE/VIDEO CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**
When referencing a specific image or video result, use these EXACT escape sequences (copy verbatim): \\ue202 (before each anchor), \\ue200 (group start), \\ue201 (group end)

Anchor pattern: \\ue202turn{N}{type}{index} where N=turn number, type=image|video, index=0,1,2...

**Examples (copy these exactly):**
- Single: "See photo\\ue202turn0image0."
- Multiple: "See photo\\ue202turn0image0\\ue202turn0video1."
- Group: "See these\\ue200\\ue202turn0image0\\ue202turn0image1\\ue201."

**CRITICAL:** Output escape sequences EXACTLY as shown. Do NOT substitute with † or other symbols. Place anchors AFTER punctuation. NEVER use markdown links, [1], footnotes, or HTML tags for any citation, including images/videos.`.trim();
}

/** Builds dynamic web search context scoped to the conversation anchor time. */
export function buildWebSearchDynamicContext(now?: string | number | Date): string {
  return `# \`${Tools.web_search}\` Runtime Context
Conversation Date & Time: ${replaceSpecialVars({ text: '{{iso_datetime}}', now })}`.trim();
}
