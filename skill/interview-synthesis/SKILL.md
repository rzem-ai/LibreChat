---
name: interview-synthesis
description: Synthesise insights from uploaded user/customer interview transcripts or notes — demographics, themes, pain points, high points, opportunities, and personas — grounded only in the provided material. Use when a user uploads one or more interview transcripts/notes and wants structured first-draft synthesis outputs that can be combined into a downloadable Word document.
---

# Interview Synthesis

Analyse interviews with users, customers, or clients to understand who was spoken to and
what they said — surfacing demographics, key themes, pain points, high points, resulting
opportunities, and summarising personas. This skill works purely on **user-provided
inputs**: the uploaded interview transcripts/notes and the outputs the user reviews and
carries between steps. It has no external data sources; it must not browse the web or pull
from any feed.

## Working from provided inputs (do this FIRST — every action)

Every output is grounded **only** in the interview transcripts/notes the user has uploaded
(and, for the later actions, the earlier outputs the user has reviewed). Do not answer from
prior knowledge and do not invent interviewees, quotes, or findings.

1. **Read the provided interviews first.** Before writing anything, read the uploaded
   transcripts/notes in full and identify the passages relevant to the task. Base each
   observation on what the interviews actually contain.
2. **Attribute insights to the transcripts.** Tie every theme, pain point, and high point
   back to the interview it came from, and use the interviewees' own words — the actions
   explicitly ask for **relevant quotes from interviewees** to support each finding.
3. **Never present a guess as an interview finding.** Where the interviews do not cover
   something, say so rather than fabricating a demographic detail, a quote, or a persona.
4. **Do not attribute the interviewer's words to interviewees.** Two actions state this
   directly (see Pain Points and High Points); apply the same discipline throughout.
5. **Treat every output as a first draft.** Each analysis step writes into an editable
   rich-text field with the helper text "Hit the button above to analyse with AI"; frame
   outputs so the user can readily review and edit them before moving on.

**Analyse in smaller chunks for best results.** Due to token limits, the best results come
from analysing interviews in smaller chunks — up to roughly **10,000 words** at a time.
When the uploaded material is larger, split it into chunks within that limit, run the
actions per chunk, and consolidate the outputs rather than feeding everything at once.

## Inputs

- **Interviews** (required) — one or more uploaded interview transcripts/notes (the upload
  accepts multiple files, doc type `Interviews`). Every action reads from this upload; a
  standing instruction is prepended to each analysis prompt stating: "The document(s)
  provided are interview transcripts/notes."
- **Carried-forward outputs** — the Opportunities and Personas actions do not re-read the
  raw interviews. They consume the **reviewed text** from earlier steps: Opportunities uses
  the edited Themes, Pain Points, and High Points; Personas uses the edited Demographics,
  Themes, Pain Points, and High Points. Run the upstream steps first.

## Ground Rules

These apply to every action below:

- **Ground every finding in the interviews.** Use only the uploaded transcripts/notes (and
  the reviewed upstream outputs) as the basis for content; do not import outside facts.
- **Quote the interviewees.** Support themes, pain points, and high points with relevant
  quotes drawn from the interviews.
- **Exclude the interviewer.** Do not attribute the interviewer's questions or comments to
  interviewees.
- **Output plain, unformatted text.** Every analysis action ends with "Do not include any
  other formatting." Follow the exact layout each action specifies and add nothing else.
- **First drafts only.** Each output lands in an editable field for the user to refine
  before the download step.

Model settings: the config does **not** specify a temperature or max-tokens value for this
plugin (see the quirks note). Owner: **Ally Fulton (afulton@deloitte.com.au)**.

## Skills / Actions

Run these in order. The first four analyse the uploaded interviews directly; the last two
build on the reviewed outputs of the earlier steps. Each action is triggered by its button
and writes into the matching rich-text field.

### 1. Demographics

**Source: the uploaded interviews.** Understand the demographic information of the
interviewees. Produce output in exactly this shape, per interview:

```
Interviewee 1: Name
- Detail 1
- Detail 2
- ...
```

Requirements, verbatim: "For each interview, please provide a short summary of the
background/demographic information available about the interviewee. Include their location,
occupation, and any other relevant information (e.g. Are they a past customer)." And the two
mandatory constraints: "Do not include any other formatting. Do not include any of the
customer's feedback or comments at this stage."

### 2. Themes

**Source: the uploaded interviews.** Collectively review the interviews and provide a list
of **3-5 key themes**. Produce output in exactly this shape:

```
Theme 1: 3-5 word title
- Summary of the theme
- Relevant quotes from interviewees
- ...

Theme 2: ...

And so on.
```

Mandatory constraint, verbatim: "Do not include any other formatting."

### 3. Pain Points

**Source: the uploaded interviews.** Collectively review the interviews and provide a list
of all of the pain points, or areas of dissatisfaction, mentioned. Pain points are things
the interviewees are not content with, or facing challenges with. Produce output in exactly
this shape:

```
Pain Point 1: 3-5 word title
- Summary of the pain point
- Relevant quotes from interviewees
- ...

Pain Point 2: ...

And so on.
```

Mandatory constraints, verbatim: "Make sure not to include quotes from the interviewer!" and
"Do not include any other formatting."

### 4. High Points

**Source: the uploaded interviews.** Collectively review the interviews and provide a list
of all of the high points, or areas of satisfaction, mentioned. These are things the
interviewees are content with, or enjoying. Produce output in exactly this shape:

```
High Point 1: 3-5 word title
- Summary of the high point
- Relevant quotes from interviewees
- ...

High Point 2: ...

And so on.
```

Mandatory constraints, verbatim: "Make sure not to include quotes from the interviewer!" and
"Do not include any other formatting."

### 5. Opportunities

**Sources: the reviewed Themes, Pain Points, and High Points** (from Actions 2-4, not the
raw interviews). Review the themes, pain points, and high points identified from the
interviews and convert them into a list of **3-5 opportunities**. The prompt interleaves the
three reviewed outputs, labelled in order as "The themes are:", "The pain points are:", and
"The high points are:". Produce output in exactly this shape:

```
Opportunity 1: 3-5 word title
- Summary of the opportunity
- Relevant theme(s)
- Relevant pain point(s) and/or high point(s)
- ...

Opportunity 2: ...

And so on.
```

Mandatory constraint, verbatim: "Do not include any other formatting."

### 6. Personas

**Sources: the reviewed Demographics, Themes, Pain Points, and High Points** (from Actions
1-4). Review these and come up with a list of **3-5 personas** which summarise the results of
the interviews. The prompt interleaves the four reviewed outputs, labelled "The demographics
are:", "The themes are:", "The pain points are:", and "The high points are:". Produce output
in exactly this shape:

```
Persona 1: Fun, relevant persona name (e.g. Sally Saver)
- Summary of the persona
- Relevant themes
- Relevant pain points
- Relevant high points
- ...

Persona 2: ...

And so on.
```

Mandatory constraints, verbatim: "Note that the persona name should NOT be an interviewee
name. It should be a fun and relevant made-up name, that hints at the persona." and "Do not
include any other formatting."

## Download — Interview Synthesis

A **Download** button exports all outputs into a **Word document** titled **"Interview
Synthesis"**. It concatenates the six reviewed fields, in order: Demographics, Themes, Pain
Points, High Points, Opportunities, and Personas. The download reflects whatever the user has
reviewed and edited in those fields; it performs no further generation. Remind the user that
the contents are first drafts to be reviewed before use.
