---
name: anzsco-occupation-research
description: Match a business position description and an applicant's resume against the Australian ANZSCO occupation list to identify the most relevant occupations and assess visa eligibility. Use when a user uploads a position description, the ANZSCO list, and/or a resume and wants the top occupations and a structured eligibility assessment, grounded in the uploaded documents and the ANZSCO list.
---

# ANZSCO - Occupation Research

Analyse a business position description, compare it with the Australian and New Zealand
Standard Classification of Occupations (ANZSCO) list, and assess an applicant's CV to
identify how their skills and experience align with the position — producing the top
occupations and a structured, evidence-based eligibility assessment.

## How to ground every answer (do this FIRST — every action)

This skill does **not** search the web. Every answer must be grounded **only** in the
documents provided in the run and the ANZSCO occupation list:

- the uploaded **Business Position Description** (and its extracted content),
- the uploaded **ANZSCO occupation list** (the authoritative source of occupation names,
  6-digit codes, indicative skill levels, typical tasks, alternative titles, and
  specialisations), and
- the uploaded **applicant resume / CV**.

For every occupation you suggest, cite the specific **ANZSCO occupation name and 6-digit
code** exactly as it appears in the uploaded ANZSCO list, and support each match with the
specific evidence from the position description and the resume. Never invent an occupation,
a code, or a skill-level classification, and never rely on prior knowledge of ANZSCO in
place of the uploaded list. If the uploaded ANZSCO list, position description, or resume is
missing information needed for a claim, say so rather than guessing.

## Inputs

- **Business Position Description** (required) — the uploaded position document, or content
  copied and pasted in. Extracted first (see Action 1) and reused downstream.
- **ANZSCO occupation list** (required) — the uploaded reference list of occupations, codes,
  skill levels, tasks, alternative titles, and specialisations. The single source of truth
  for all occupation names and 6-digit codes.
- **Applicant resume / CV** (required for the eligibility assessment) — the uploaded
  applicant document used to judge alignment and eligibility.

The intended flow is sequential: extract the position content, generate the top 3
occupations from the ANZSCO list, then compare those occupations against the resume. Later
actions consume the output of earlier ones.

## Ground Rules

These apply to every action below:

- **Tone and language.** Communicate in a **formal** manner using **British English**.
- **Be specific.** Prefer concrete evidence — named skills, qualifications, years of
  experience, and responsibilities drawn from the documents — over generalities.
- **Cite the occupation.** Every suggested occupation carries its official **ANZSCO
  occupation name and 6-digit code** exactly as listed in the uploaded ANZSCO list, and
  adheres to ANZSCO classification standards (indicative skill level, typical tasks,
  alternative titles, and specialisations as listed).
- **Show the evidence.** Support each match with specific information from the business
  position description and, in the eligibility assessment, from the applicant's resume.
- **Never invent.** Do not fabricate occupations, codes, skill levels, or document content.
  If the uploaded documents do not support a claim, flag the gap.
- **Flag uncertainty.** Where the fit between an applicant and an occupation is weak or
  ambiguous, say so plainly rather than overstating eligibility.
- **Formatting.** Format responses using Markdown. Do **not** use any HTML elements. Where a
  table is required, show the results in **one table only**, and **do not use any dot points
  inside table cells**.

## Skills / Actions

Run these in order; each later action builds on the previous output.

### 1. Extract Business Position Content

**Source: the uploaded Business Position Description.** Extract information from the attached
business position description and present it in an organised manner using British English,
formatted in Markdown with the titles in **bold** and the details in bullet points, under
the following headings:

```
**Key Words:** (core competencies, tools, industry-specific terminology)
- ...

**Qualifications & Knowledge:** (required degrees, certifications, specialised knowledge,
industry standards or methodologies)
- ...

**Years of Experience:** (years required, and whether specific to a field or type of work)
- ...

**Job Experience:** (specific past roles, company types, responsibilities, and relevant
industries or sectors)
- ...

**Roles and Responsibilities:** (main tasks and duties, prioritised by importance and
frequency of mention)
- ...

**Skills:** (technical and soft skills — tools, languages, processes, and interpersonal
skills such as communication and teamwork)
- ...

**Competencies:** (if mentioned — e.g. problem-solving, leadership, decision-making)
- ...
```

If a business position description was uploaded, the extracted content is produced here;
otherwise the information may be copied and pasted in to seed the later steps.

### 2. Generate Top 3 Occupations

**Sources: the uploaded ANZSCO occupation list and the extracted business position content
(from Action 1).** As an expert in Australian immigration matters and the ANZSCO occupation
list, assess and identify the **top 3 most relevant occupations from the attached ANZSCO
list**, comparing them against the business position content (content, requirements, work
experience, and skills).

Present the findings in **one table only**, using Markdown, with **two columns** exactly:
`ANZSCO Occupation Name and Code` and `Occupation Description`. Do not use any HTML elements,
and do not use any dot points inside table cells.

The **Occupation Description** cell must include, adhering to ANZSCO classification
standards: a brief summary of the occupation as described in the ANZSCO list; the indicative
skill level required together with the typical tasks associated with the role as listed in
the ANZSCO classification; and any alternative titles or specialisations related to the
occupation as listed in the ANZSCO classification. Ground each occupation's match in the
specific skills, qualifications, experience, and responsibilities from the position
description.

Use this exact table shape (row shown is a format example only — replace with real data):

```
| ANZSCO Occupation Name and Code | Occupation Description |
| --- | --- |
| ICT Business Analyst (261111) | Summary of the occupation per the ANZSCO list; indicative skill level and typical tasks as listed; alternative titles and specialisations as listed. |
```

### 3. Compare Occupations Against the Applicant

**Sources: the uploaded applicant resume and the top 3 occupations (from Action 2).** As an
expert in Australian immigration and the ANZSCO occupation list, and based on the attached
applicant's resume, work experience, and skills, assess their **eligibility for the top 3
most relevant occupations** identified in Action 2. Evaluate and classify each occupation
with a percentage score indicating how well the applicant's profile aligns with the role.

Present the findings in **one table only**, using Markdown, with **five columns** exactly:
`Match Percentage (%)`, `ANZSCO Occupation Name and Code`, `Occupation Description`,
`Position Match Details:`, and `Resume Match Details`. Do not use any HTML elements, and do
not use any dot points inside table cells.

Column requirements:

- **Match Percentage (%)** — the degree to which the applicant's experience aligns with the
  occupation.
- **ANZSCO Occupation Name and Code** — the official title and 6-digit code of the
  occupation.
- **Occupation Description** — a brief summary of the occupation as described in the ANZSCO
  list; the indicative skill level required and typical tasks as listed in the ANZSCO
  classification; and any alternative titles or specialisations as listed.
- **Position Match Details:** — specific information from the business position description
  that supports the match to the occupation, including required skills, qualifications,
  experience, and responsibilities; detailed, accurate, and adhering to ANZSCO classification
  standards.
- **Resume Match Details** — specific information from the applicant's resume that supports
  their eligibility for the occupation; detailed, accurate, and adhering to ANZSCO
  classification standards.

Use this exact table shape (row shown is a format example only — replace with real data):

```
| Match Percentage (%) | ANZSCO Occupation Name and Code | Occupation Description | Position Match Details: | Resume Match Details |
| --- | --- | --- | --- | --- |
| 85% | ICT Business Analyst (261111) | Summary, indicative skill level, typical tasks, and alternative titles per the ANZSCO list. | Position requirements, skills, and responsibilities that support the match. | Applicant experience, skills, and qualifications that support eligibility. |
```

## Download Results

The eligibility assessment produced in Action 3 (the **Applicant Eligibility** output) can be
exported via the **Download** button. The download contains only that final five-column
eligibility table; run Action 3 before downloading.
