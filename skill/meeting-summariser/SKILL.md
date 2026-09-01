---
name: meeting-summariser
description: Generate structured meeting summaries from transcripts or notes, including overview, participants, discussion items, and action items. Use when someone wants to summarise a meeting, process a Teams or Zoom transcript, get action items from meeting notes, or prepare a shareable message from a meeting. Trigger phrases include "meeting summariser", "summarise meeting", "meeting transcript", "meeting notes", "action items", "meeting summary".
---

# Meeting Summariser

Generates structured meeting summaries from transcripts or meeting notes, producing an overview, participant list, discussion items, and action items. Also supports freeform questions about the meeting and can convert the summary into a tailored shareable message (email, Teams message, or post).

## What This Does

- **Generates a meeting summary** — overview, participants, discussion items (brief or detailed), and action items, all in one step
- **Answers questions about the meeting** — freeform Q&A against the transcript (e.g. "What was the tone?", "What was John's opinion on AI?")
- **Prepares a shareable message** — converts the summary into an email, Teams message, or channel post with configurable format, length, tone, recipients, and additional notes

Output is formatted in markdown. Transcript downloads are supported from Teams and Zoom.

## How to Use (App Workflow)

The Meeting Summariser app (plugin 4) has a five-step workflow:

### Step 1: Upload a File
Upload the transcript or meeting notes. A single file is supported. Transcripts can be downloaded directly from Teams or Zoom.

### Step 2: Generate Summary
Select the detail level for discussion items, then generate all four summary sections simultaneously:

| Detail Level | Discussion Items Output |
|---|---|
| **Brief** | Key discussion items grouped under 2–3 word headers with dot points. No extra formatting. |
| **Detailed** | Same structure, but omits non-useful talking points (e.g. introductions). |

**Output sections generated in parallel:**
1. **Overview** — one sentence summary of the meeting
2. **Participants** — names of speaking participants (note: silent participants may not appear)
3. **Discussion Items** — grouped under 2–3 word headers with dot points
4. **Action Items** — numbered list of follow-up activities with owner (if mentioned or implied) and a 10–15 word description

### Step 3: Download Summary
Download all four sections as a formatted Word document ("My AI Meeting Summary").

### Step 4: Get Insights
Ask freeform questions about the meeting to get AI-generated insights. Questions can be changed to get new answers.

Examples: *"What was the tone of the meeting?"*, *"What was John's opinion on AI?"*

### Step 5: Prepare to Share
Convert the summary into a tailored shareable message. Configure:

| Setting | Options |
|---|---|
| **Format** | Email / Quick Teams Message / Public Post in a Teams Channel/Viva Engage |
| **Length** | Up to 100 words / 100–200 words / 200–400 words |
| **Tone** | Professional / Concise / Friendly / Upbeat (multiple can be selected) |
| **Recipients** | Who the message should be addressed to |
| **Additional Notes** | Any content beyond the summary to include in the message |

The tailored message can be downloaded separately ("My AI Meeting Summary - Shareable Message"). Output is plain text — no Markdown formatting.

## Agent Behaviour

When this skill is loaded:

1. **Collect the transcript** — ask the user to provide the meeting transcript or notes (uploaded or pasted). Remind them that Teams and Zoom transcripts can be downloaded directly.
2. **Ask for detail level** — ask whether Discussion Items should be Brief or Detailed.
3. **Generate the summary** — run all four generation prompts in parallel and present the results clearly labelled: Overview, Participants, Discussion Items, Action Items.
4. **Accuracy check** — verify the action items are consistent with what was discussed. Flag any inferred owners clearly.
5. **Offer insights** — invite the user to ask freeform questions about the meeting.
6. **Offer to prepare a shareable message** — ask if they want to convert the summary into an email, Teams message, or post. If yes, collect format, length, tone, recipients, and any additional notes, then generate the message.
7. **Offer download** — remind the user they can copy the output or export it. Offer to run the skill `text-to-docx` to convert the output into a downloadable Word document.

## System Prompt (Applied Internally)

### Overview
> Write a brief, one sentence summary of the meeting.

### Participants
> The document provided is a transcript or notes from a meeting. Based on the transcript, who spoke at the meeting? Please list their names.

### Discussion Items — Brief
> What are the key discussion items of this meeting? Group these under headers, with dot points, like this:
>
> Discussion Item 1: 2-3 Word Title
> - Notes
> - Notes
>
> Do not use any additional formatting.

### Discussion Items — Detailed
> What are the key discussion items of this meeting? Group these under headers, with dot points, like this:
>
> Discussion Item 1: 2-3 Word Title
> - Notes
> - Notes
>
> Do not use any other formatting. Do not include non-useful talking points, like introductions, as discussion items.

### Action Items
> What follow-up activities could be inferred from the transcript? List the follow-up activities as simple, clear action items. Include each item's owner, if one is mentioned or implied. Format your response as follows, with no additional formatting:
> 1. 2-3 Word Title (Owner): 10-15 word description
> 2. 2-3 Word Title (Owner): 10-15 word description

### Insights (freeform Q&A)
> The document provided is a transcript or notes from a meeting. The user has a question about the meeting, and wants you to answer based on your inferences. Please answer the following: **[user question]**

### Shareable Message
> Prepare a **[format]** for the user based on the meeting summary provided. Do NOT format your response using Markdown. The tone of the message should be: **[tone]**. You should address it to: **[recipients]**. You should also mention the following notes: **[additional notes]**. Keep the length of the message to **[word count]**.
>
> Meeting Summary: **[overview + discussion items + action items]**

## Plugin Metadata

| Field | Value |
|---|---|
| Plugin ID | 4 |
| Plugin type | 2 (Stepper app) |
| Visibility | local, dev, stage, prod |
| Permission | Public |
| Country restriction | None |
| Temperature | 0.5 |
| Max tokens | 2000 |
| Owner | Ally Fulton (afulton@deloitte.com.au) |
| Report to | Ally Fulton (afulton@deloitte.com.au) |
| Tags | Meetings & Workshops |

## Disclaimer

AI outputs can sometimes include inaccuracies. Ensure all generated content is reviewed and verified before use or submission.
