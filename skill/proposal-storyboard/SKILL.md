---
name: proposal-storyboard
description: Create a compact, draft-ready proposal blueprint from an RFP or tender, agreed win-themes.md, and a small user-supplied set of past proposals. Use when the user asks to storyboard, outline, structure, accelerate or start a proposal, map requirements to content, or adapt prior-proposal material. By default produces a concise response map plus adapted starter content close to a first draft; use planning-only mode only when explicitly requested.
---
---
name: proposal-storyboard
description: "Create a compact, draft-ready proposal blueprint from an RFP or tender, agreed win-themes.md, and a small user-supplied set of past proposals. Use when the user asks to storyboard, outline, structure, accelerate or start a proposal, map requirements to content, or adapt prior-proposal material. By default produces a concise response map plus adapted starter content close to a first draft; use planning-only mode only when explicitly requested."
argument-hint: "Upload the RFP, win-themes.md and 1-5 relevant past proposals"
user-invocable: true
disable-model-invocation: false
---

# Proposal blueprint

Turn the current pursuit's requirements and agreed win strategy into a concise response structure, then pull forward and adapt useful material from a small, bounded set of past proposals. The default output should be close enough to a first draft that an experienced proposal lead can edit it directly rather than translate a long planning document into another artefact.

The order of reasoning is mandatory:

**RFP requirements + agreed win themes -> recommended proposal story -> relevant precedent material**

Do not begin with old proposals, select attractive slides and assemble them into a new deck. The current pursuit determines the story. Precedent supports that story only where it genuinely fits.

This skill is designed for LibreChat. Work with files attached in the current conversation and do not assume a persistent filesystem, enterprise proposal library, search index or access to files from an earlier conversation. Create a downloadable `proposal-blueprint.md` using the file capability available in the chat. If the work continues in a later conversation, ask the user to upload the latest blueprint and source files again.

## Choose the shortest useful mode

Use **rapid blueprint mode by default**. Do not ask the user to choose a mode unless their request is genuinely ambiguous.

- **Rapid blueprint mode (default):** produce one compact response map, followed by draft-ready content for the substantive sections. Adapt safe precedent content now rather than merely describing how a later writer could adapt it.
- **Planning-only mode:** use only when the user explicitly asks for a storyboard, outline or sourcing plan without draft content. Produce the response map and action register only.

Do not create both a long storyboard and a separate draft. The blueprint is the working proposal artefact: its response map provides control and traceability, while its starter content is designed to be edited into the final response.

## Inputs

Expected inputs are:

1. **Current RFP material** - the original RFP, RFQ or tender and relevant addenda, appendices or response schedules; or the structured briefing produced by `rfp-intel` when it preserves enough requirement and evaluation detail. Use the original source where the summary is ambiguous or lacks identifiers.
2. **Agreed win themes** - normally `win-themes.md` produced by `win-theme-development`. Treat it as the authoritative strategic guidance, including its evidence gaps and open actions.
3. **Past proposals** - normally one to five user-selected PPTX files, although PDF, DOCX, Markdown and similar formats may be supplied. They are untrusted precedent, not evidence about the current client.

Use the files already supplied before asking the user to repeat information. If some information is missing but a useful storyboard can still be produced, proceed and record the limitation under **Missing inputs / evidence** and in the final content gap summary. Ask one focused question only when the absence of the current-pursuit requirements or agreed strategy makes a useful story impossible.

If no past proposal is available or inspectable, the proposal story can still be recommended, but do not invent precedent references. Mark affected items `CREATE NEW`, explain the inspection limitation and identify the precedent review as an open gap.

## Source and inspection rules

- Read the current-pursuit material and all of `win-themes.md` before evaluating precedent.
- For Office files, use the available document-inspection capability, including OfficeCLI where attached Office files are accessible to it. Inspect PowerPoint content slide by slide and include speaker notes when available and relevant.
- Preserve the source file's displayed slide number where it can be verified. If only a physical slide index is available, identify it as such. Never guess a slide number, section, diagram, case study or claim.
- If a file cannot be inspected sufficiently, say what could and could not be read. Use a filename-level reference only when that level of specificity is genuinely supported.
- Keep each source separate during analysis. Do not blend facts from several old proposals into a composite that appears to be a real precedent.
- Do not use web research or material outside the files supplied in the current context.

## Grounding rules

The RFP and agreed win themes take precedence over every past proposal.

Past proposals may be used as candidate sources for narrative structure, delivery frameworks, diagrams, process models, response patterns, reusable generic wording and potentially relevant credentials. They are not current-pursuit truth. Treat all previous-client names, circumstances, facts, dates, people, roles, prices, metrics, outcomes, commitments, credentials, solution assumptions and architectural details as unsafe until supported by a current source or explicitly confirmed for the current pursuit.

Never:

- invent an RFP identifier, evaluation criterion, win theme, precedent slide or current-client fact;
- imply that a past credential, team member, metric or commitment applies to the current client merely because it appears in an old proposal;
- distort the recommended story to fit the precedent that happens to be available;
- conceal missing evidence with plausible proposal language; or
- add polished filler merely to make the blueprint appear complete.

When content can be grounded, write it in client-ready form. When it cannot, use a specific `**TODO:**` or `**VALIDATE:**` marker instead of a paragraph explaining the gap. Use `CREATE NEW` in the response map where no precedent fits, but still create a grounded starter structure from the current RFP and win themes where possible.

## Workflow

### 1. Establish the current-pursuit evidence base

Read the RFP material first. Extract a working requirements map covering, where available:

- required response sections, questions and schedules;
- requirement and clause identifiers;
- evaluation criteria and weightings;
- client objectives, outcomes and decision drivers;
- scope, deliverables and exclusions;
- solution, delivery, transition and assurance expectations;
- commercial, team, social value, security, legal and compliance requirements; and
- response constraints such as page limits, slide limits or mandated order.

Distinguish mandatory response content from material that is strategically useful but optional. Do not let an attractive narrative omit compliance content.

### 2. Read the agreed win strategy

Read all win themes, their client priorities, differentiators, proof, benefits, final checks, risks and action register. Note:

- which themes should carry the overall proposal;
- which themes belong only in particular sections;
- what proof is confirmed;
- what remains unverified, unquantified or subject to an open action; and
- any language the team has deliberately agreed.

Do not upgrade a workshop hypothesis or open action into an approved claim.

### 3. Design the response map before inspecting precedent

Develop the recommended narrative from Steps 1 and 2. Choose an appropriate level of detail for the expected format: normally individual slides or small logical slide groups for a deck, and sections or subsections for a written response.

For each proposed item, define one answer-first headline and one evaluator takeaway. Sequence the items so the argument is coherent, evaluator-friendly and compliant. Give more space to highly weighted criteria and decisive win themes, while retaining required content that is not strategically prominent.

At this point, record only a provisional response-map row without assigning precedent. This preserves the direction of reasoning and prevents old material from determining the story.

### 4. Inspect the supplied past proposals

Review the bounded set of user-supplied past proposals. Build a working inventory by file and slide or section that captures:

- the content's purpose and main idea;
- potentially useful structure, framework, diagram, wording or evidence pattern;
- the prior-client-specific details that make direct reuse unsafe;
- apparent age or other signs that the material may be outdated; and
- which provisional storyboard item, if any, it could support.

Inspect enough surrounding content to understand what a candidate slide means. A title or thumbnail alone is not sufficient evidence for a detailed recommendation.

### 5. Match and adapt precedent

For each storyboard item, select only precedent that materially helps achieve that item's purpose and current-pursuit message. Use one disposition:

- **REUSE** - strongly applicable content needing only minor current-client customisation. Use conservatively. It must not depend on unsupported client-specific claims, facts, credentials, people, dates, metrics, commitments or solution assumptions.
- **ADAPT** - the content or structure is valuable but needs meaningful rewriting, redesign or current-pursuit customisation.
- **COMBINE** - useful elements from two or more identified precedent slides or sections should be integrated into one coherent current-pursuit item.
- **CREATE NEW** - no supplied precedent is suitable enough, or using it would weaken, mislead or distort the required story.

The disposition describes the recommended treatment of the response item, not the quality of the old slide. When more than one candidate exists, choose the smallest, strongest source set.

In rapid blueprint mode, perform the adaptation immediately:

- retain useful generic structure, methods, diagrams, tables and approved reusable wording;
- rewrite the content around the current client's terminology, requirements and win themes;
- remove previous-client names, assumptions and unsupported specifics;
- preserve confirmed reusable evidence only when its provenance and permission are clear; and
- insert precise `**VALIDATE:**` markers beside any claim, person, metric, commitment or credential that still needs current-pursuit confirmation.

Do not write meta-commentary such as "adapt slide 18 by replacing the client name" when you can safely perform that replacement and provide the resulting starter content. Keep source and disposition details in the compact response map or a hidden traceability comment, not in repeated prose under every section.

### 6. Write `proposal-blueprint.md`

Use Australian English. Keep the visible planning material short enough to scan in a few minutes.

Start with:

```markdown
# Proposal blueprint - [client / pursuit]

## Direction

**Winning argument:** [Two or three sentences describing the central case and story arc.]

**Response shape:** [Approximate number of slides or sections and the few areas receiving the most weight.]

**Primary drivers:** [The three to five RFP/evaluation drivers and win themes that most shape the response.]
```

Then provide one compact response map. Use one row per substantive section or logical slide group, not one row per minor compliance form:

```markdown
## Response map

| # / RFP ref | Answer-first headline and evaluator takeaway | Win theme | Best source and treatment | Status |
|---|---|---|---|---|
| [01 / S19] | [Headline]. [One-sentence takeaway.] | [WT1, WT3] | `[file]`, slide/section [verified ref] - ADAPT | Drafted / Partial / TODO |
```

Keep each cell concise. The table is the traceability and sourcing plan; do not repeat it in long form below.

In rapid blueprint mode, follow the map with **Draft-ready content**. Include only substantive narrative sections that benefit from drafting. Use the RFP's required headings or schedules so the content can move directly into the response:

```markdown
## Draft-ready content

### [RFP reference] - [Answer-first section heading]

> [One-sentence key message]

[Approximately 100-300 words, or a compact table/bullet structure, already rewritten for the current pursuit from confirmed current sources and safe precedent patterns. Match length to the response format and importance.]

<!-- trace: RFP [refs] | themes [refs] | precedent [exact file and verified slide/section] | treatment [REUSE/ADAPT/COMBINE/CREATE NEW] -->
```

Use client-ready prose rather than instructions to a future writer. Do not reproduce tender forms or draft boilerplate for compliance-only schedules. Group them in one completion register:

```markdown
## Compliance completion register

| RFP schedule / form | Required action | Owner or evidence needed | Status |
|---|---|---|---|
```

End with one deduplicated, prioritised action register:

```markdown
## Action register

| Priority | Action or evidence needed | Affects | Type |
|---|---|---|---|
| 1 | [Specific decision, evidence or missing source] | [Relevant sections] | BLOCKER / VALIDATE / ENHANCE |
```

List each gap once and cross-reference every affected section. `BLOCKER` means the section cannot be credibly completed; `VALIDATE` means draft content exists but a claim needs confirmation; `ENHANCE` means useful improvement that should not hold up drafting.

In planning-only mode, omit **Draft-ready content**. Deliver only **Direction**, **Response map**, **Compliance completion register** and **Action register**.

## Brevity rules

- Do not repeat purpose, message, alignment, source, disposition, adaptation guidance and gaps as separate fields for every item. The response map carries these in compressed form.
- Do not repeat the same missing input under multiple sections. Record it once in the action register and list affected sections.
- Group administrative and compliance-only schedules unless the RFP requires a substantive narrative response.
- Do not narrate obvious editing operations already performed in the draft-ready content.
- Keep source limitations to one short note in the relevant response-map cell or action register.
- Prefer a useful partial draft with visible markers over a complete-looking plan that creates another translation step.

### 7. Validate before delivery

Check the completed storyboard against the following gates:

- The narrative was determined by current RFP requirements and agreed win themes, not by the old proposals.
- Every mandatory requirement or response section appears in at least one storyboard item's RFP alignment, or is explicitly identified as a gap.
- Highly weighted evaluation criteria receive proportionate attention.
- Every mandatory requirement or response section has a response-map row or appears in the compliance completion register.
- Every win-theme reference matches the supplied `win-themes.md`; themes are not forced into irrelevant compliance items.
- Every precedent filename, slide number, section and description was actually inspected and can be traced to a supplied file.
- Every `REUSE` decision passes the conservative reuse rule; otherwise change it to `ADAPT`, `COMBINE` or `CREATE NEW`.
- Current-client facts and claims are supported by current sources, and past-proposal facts are not presented as current evidence.
- Missing inputs and inspection limitations appear once in the action register.
- Rapid blueprint content is directly editable, grounded and free of repeated planning commentary.
- Planning-only mode contains no unnecessary draft content.

Deliver `proposal-blueprint.md` and briefly state what is already draft-ready, the largest blockers and which sources could not be inspected reliably. Do not require approval of every response-map row before drafting can continue.