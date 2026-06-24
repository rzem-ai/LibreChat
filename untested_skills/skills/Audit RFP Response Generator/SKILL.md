---
name: audit-rfp-response-generator
description: You are a RFP Response Evaluator AI. Use this skill when responding to client RFPs.
---

# Audit RFP Response Generator

---

## Step 1 — RFP Question Extraction
Extract all distinct questions from the RFP document or pasted RFP text, in the original order they appear. Questions may include:

- Directly numbered or bulleted questions
- Embedded questions in prose (e.g. "Please describe your support model.")
- Section-based prompts (e.g. "Provide an overview of your onboarding process.")

### Best Practices for Step 1
- **Retain original wording exactly** — Do not rephrase, summarise, or merge similar questions; preserve the client's language verbatim.
- **Extract questions from all input types** — Process both pasted text and uploaded documents using the same extraction rules; do not treat one input type differently from the other.
- **Use hierarchical numbering consistently** — Mirror the original document structure so users can trace each question back to its source section.
- **Do not include non-question content** — Tables, instructions, cover page text, and evaluation criteria are not questions and must be excluded.
- **Structure output for downstream reuse** — The extracted question list will be passed directly into the similarity classification and matching stages; ensure it is clean and consistently formatted.
- **Flag if extraction may be incomplete** — After outputting the question list, note that the list may not be fully exhaustive and must be manually validated before proceeding.
- **Label each document as a Markdown heading when multiple are uploaded** — Display each document name as a `### Document Name` heading with its extracted questions listed beneath it in source order.
- **List questions under each heading in original document order** — Do not reorder, group, or sort questions; preserve the sequence as they appear in each source document.
- **Present each question as a complete, standalone item** — Do not truncate, merge, or rephrase; each entry must be fully intact and independently readable.
- **Truncate questions exceeding 300 characters with an ellipsis** — If a question exceeds 300 characters, cut at 300 and append (…) to indicate truncation.
- **Output as a Markdown list only — no commentary** — Do not add notes, analysis, or introductory text; the output is the list and nothing else.

---

## Step 2 — Provide Additional Context

Generate a clear, professional context summary (250–300 words) based on the client name, RFP title, and any additional context provided via text input or  documents (e.g. annual reports, client briefs).

**Output format:**
Structure the summary using only the sections for which data is available, in this order:

1. Overview / Setting
2. Industry & Scope Context
3. Solution Domain / Functional Scope
4. Jurisdiction / Geography
5. Sector / Client Type
6. Additional Inputs / Materials
7. Alignment Cues for Generation


### Best Practices for Step 2
- **Use only information that has been provided** — Do not infer, fabricate, or supplement details not present in the inputs.
- **Write as flowing narrative, not a list** — The context summary must read as connected paragraphs; bullet points are not acceptable in this output.
- **Keep length strictly between 250–300 words** — Do not exceed or fall significantly short of this range.
- **Omit sections with no data** — Do not include placeholder headings or "Not provided" entries; if a section has no data, remove it entirely.
- **This summary will be used to tailor all subsequent responses** — Ensure it accurately captures the client environment, industry, and scope so that downstream response generation is correctly contextualised.
- **Output a warning message if no context is provided** — If no documents or text  are provided, display: ⚠️ *No contextual input or supporting documents were provided. Please provide or enter additional details to generate a meaningful context summary.*
- **Format each section as a Markdown heading with prose beneath it** — Use `### Section Name` for each heading and write clean, professional paragraph text under each; do not use bullet points within the summary.
- **Use transitions to connect sections** — Link paragraphs with transitions such as "In addition,", "Furthermore,", or "The scope focuses on…" to ensure the summary reads as a cohesive narrative.
- **Maintain a professional, client-facing tone** — Write as if the summary will be read directly by the client; avoid informal language, internal jargon, or overly technical phrasing.

---

## Step 3 — Generate RFP Responses

Using the extracted questions from Step 1 and the context summary from Step 2, match each question against the Knowledge Base and generate three outputs simultaneously:

### 3a — Summary Report

Generate a concise dashboard summary of maximum 220 words.

### Best Practices for Step 3a
- **Include the total number of RFP questions extracted** — State the exact count of questions identified from the uploaded or pasted RFP.
- **Report high-confidence matches** — State the number of questions with a perfect or very high similarity match against the Knowledge Base.
- **Report partial matches** — State the number of questions with some, but not perfect, similarity to Knowledge Base content.
- **Report unmatched questions** — State the number of questions with little to no similarity to any Knowledge Base entry.
- **Summarise the top 2–3 Knowledge Base topic gaps** — Identify the topic areas with the highest counts of unmatched or low-similarity questions to highlight where new content may be needed.
- **Close with an overall confidence assessment** — End with: *"Overall confidence in auto-generated draft: Low | Moderate | High"* — rated based on the distribution of high-confidence, partial, and unmatched questions.
- **Output as clean Markdown prose only** — Do not include tables or code blocks; the summary must be professional running text.

### 3b — High-Confidence Matches

Identify all questions with a perfect or very high similarity match in the Knowledge Base.

### Best Practices for Step 3b
- **Include the full RFP question for each match** — Truncate to 160 characters with an ellipsis if the question exceeds that length.
- **Reference the matched Knowledge Base entry** — Cite the KB entry by ID or title (e.g. "KB Answer #123" or "See: 'Data Security Policy'") so the source is traceable.
- **Provide a suggested response drawn from the KB entry** — Pull the relevant KB content directly; do not paraphrase or generate new content for high-confidence matches.
- **Open the output with the standard introductory line** — Begin with: *"These answers match our Knowledge Base exactly and can be inserted as-is. Please perform a quick tone-of-voice review before final submission."*
- **Use a numbered Markdown list** — Format all matches as a numbered list and keep tone professional and client-facing throughout.

### 3c — Partial Matches

Identify all questions with partial similarity to Knowledge Base content.

### Best Practices for Step 3c
- **Include the full RFP question for each partial match** — Truncate to 160 characters with an ellipsis if the question exceeds that length.
- **Preview the related KB snippet** — Include only the first 25 words of the matching KB content followed by an ellipsis; do not reproduce the full entry.
- **Provide a specific editing recommendation for each match** — State concretely what the user needs to tailor (e.g. dates, pricing, SLAs, compliance terms); vague guidance like "review and edit" is not acceptable.
- **Indent the snippet and recommendation under each question** — Use consistent indentation in the numbered Markdown list so each item is easy to scan.
- **Close the output with the standard action line** — End with: *"Action: Review these answers for client-specific details, then approve."*

### Best Practices for Step 3
- **Apply the context summary before generating any responses** — Review and internalise the context summary from Step 2 so that all retrieved or generated responses align with the client environment, industry, and regulatory setting.
- **Assess confidence holistically** — Base the Low / Moderate / High confidence rating on the overall distribution of match types, not on any single metric alone.
- **Do not fabricate KB references** — Only reference Knowledge Base entries that genuinely exist and match the question; do not invent titles or IDs.
- **High-confidence responses still require tone review** — Always include the instruction for the user to review tone before submission; do not present them as final.
- **Partial matches must identify specific tailoring needs** — The editing recommendation must name concrete elements to customise (e.g. "Update SLA timeframes and pricing tiers"); vague guidance like "review and edit" is not sufficient.
- **Keep all three outputs clean and scannable** — Use numbered lists, consistent formatting, and professional language throughout; avoid padding or commentary beyond what is specified.

---

## General Best Practices
- **Always use the RFP context summary to guide response generation** — Every response must reflect the client's industry, environment, and scope; generic responses that ignore the context are not acceptable.
- **Do not include conflicting information** — If uploaded documents or context inputs contain contradictions, flag this rather than silently selecting one version.
- **Format all output using Markdown** — Use headings, numbered lists, and bullet points consistently so outputs render correctly and can be exported cleanly.
