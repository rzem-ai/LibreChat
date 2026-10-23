# MyAssist Academy: style guide

Rules for every article, card blurb and glossary entry in the Academy. Read this before you write. For where files go and how to register them, see [how to add content](myassist_academy_how_to_add_content.md).

Readers are busy, not technical, and want to get something done. Each page has one purpose, every element earns its place, and pages hand off to each other instead of repeating.

## Contents

- [Principles](#principles)
- [Names and capitalisation](#names-and-capitalisation)
- [Voice and sentences](#voice-and-sentences)
- [Titles and headings](#titles-and-headings)
- [Page types and frame](#page-types-and-frame)
- [Try this cues](#try-this-cues)
- [Definitions](#definitions)
- [Card blurbs](#card-blurbs)
- [Sharing](#sharing)
- [Formatting and punctuation](#formatting-and-punctuation)
- [Components](#components)
- [Anchors and links](#anchors-and-links)
- [Checklist](#checklist)

## Principles

1. **Start from the reader's situation.** The opening paragraph says what the reader is trying to do, then what the page covers.
2. **One purpose per page.** A page teaches a task, explains a thing or answers a lookup. It does not do all three.
3. **Show, don't just tell.** Every page except the introduction ends with a **Try this now** cue the reader can copy into MyAssist.
4. **Hand off, don't repeat.** If another page owns a topic, link to its section. Cross topics only where one page genuinely depends on another, such as sharing a skill an agent uses.
5. **Start with the business problem, then add technology.**

## Names and capitalisation

- Say **MyAssist**. Never "MyAssist NextGen", "the platform" or "the tool".
- Lowercase the generic nouns in prose: prompt, saved prompt, skill, agent, connector, file, artifact, chat.
- Capitalise only:
  - a UI label, in bold and exactly as shown: **Skills**, **Prompts**, **Agent Builder**, **Created by me**
  - a named thing: Skill Builder, Agentic Ecosystem, GCSE, SKILL.md
  - the first word of a sentence or heading
- Match the interface label exactly: **Agent Library**, **Invocation Mode**, **Agent Builder**. Use "artifact" as the interface does, and write en-GB: summarise, organise, behaviour. Write "per cent" in prose and "%" in tables.

| Don't | Do |
|---|---|
| Create a Skill and share it with your Agent | Create a skill and share it with your agent |
| Open the skills library | Open **Skills** from the side menu |

## Voice and sentences

- Second person, active voice, present tense: "Upload your document", not "Documents can be uploaded".
- Use contractions: you'll, don't, it's.
- Keep sentences under 20 words. Keep paragraphs to two to four sentences and one idea each.
- Imperative for steps: "Select **Create**", not "You will need to select **Create**".
- Friendly, not cute. No exclamation marks, no emoji, no "exciting".
- No rhetorical questions.
- Banned words: easy, simple, quick, very, just, really, simply. Describe the thing instead: "one command", "default settings".
- Replace vague quantifiers (many, often, typically, significantly) with a specific claim, or cut them.
- Name the action. Don't use metaphor verbs such as "moves through", "lands" or "carries".
- Don't open a paragraph by recapping the last one ("With this setup complete…"). Move straight to the next point.
- Machines don't do human-physical things. Write "the browser fetches the URL", not "hand the browser a URL".
- Spell out acronyms on first use: Model Context Protocol (MCP).
- Use "we" only for deliberate actions by the MyAssist team. Never use it to mean "you".

## Titles and headings

Titles are sentence case, at most eight words, with no leading article.

| Pattern | Use when the page | Example |
|---|---|---|
| How to [verb] | Teaches one task | How to write an effective prompt |
| Guide to [things] | Covers one MyAssist capability end to end | Guide to skills |
| What is [thing] | Explains a concept | What is the Agentic Ecosystem |
| Introduction to [thing] | Orients a new reader | Introduction to MyAssist |
| Glossary | Is a lookup | Glossary |

Headings:

- `##` for sections, `###` for sub-sections. Sentence case, no trailing punctuation.
- Descriptive, so the reader can guess the content from the heading alone. No "Overview", "Introduction", "Notes".
- Every section opens with a one-sentence summary.
- A heading is a URL. Renaming one breaks every link to it (see [anchors and links](#anchors-and-links)).

## Page types and frame

Declare the type in frontmatter: `concept`, `how-to`, `guide` or `reference`. Add a `summary`: one plain sentence, shown as the first paragraph of the body under the date. State the substance. Don't describe the page ("This page covers…").

**Guide** (one per capability), in this order:

1. Summary
2. **What it is**: a plain definition, one paragraph, one analogy at most
3. **Why it matters**: the reader's situation, one or two sentences
4. **Where to find it**: only when the location isn't obvious from the steps
5. The real content: steps, patterns, examples, combining with other capabilities
6. **Share a [thing]**: prompts, skills and agents only
7. **Try this now**
8. A next-step card

**How-to**: summary, why this matters, the method, a worked example, try this now, next step.

**Concept**: summary, the explanation in sections the reader can scan, a link to fuller reading where one exists.

**Reference**: summary, then entries in a fixed format.

Don't add "X vs Y" sections. Put the one-sentence contrast in the definition of the relevant glossary term.

## Try this cues

A cue turns reading into doing. It's an action on the reader's own work, not an example.

Rendered by `<TryThis>`. Label, action, then a prompt:

```mdx
<TryThis
  action="Rewrite a prompt you've used recently with GCSE"
  prompt={`Goal: Summarise the risks in this proposal.
Context: I'm presenting to the engagement partner tomorrow.
Source: Use the attached document only.
Expectations: Bullet points, one page, plain language.`}
/>
```

- **Action**: under 15 words, starts with a verb, says where ("Open a new chat", "Upload a document").
- **Prompt**: copy-paste ready, written the way someone talks to MyAssist, using the reader's own work. Show a framework in action rather than telling MyAssist to "use a framework".
- One cue per major section, placed straight after the concept. Don't stack two in a row.
- The last cue on the page uses `closing`, which renders **Try this now →**.
- The test: if the reader did only this, would they learn the thing?

## Definitions

Used in the glossary and in "What it is" sections.

- One plain sentence says what the thing is. A second says how it relates to its neighbours.
- Build upward. Define foundations first (model, prompt, file), then terms made from them (skill, connector), then terms made from those (agent, Agentic Ecosystem).
- Write relationships as formulas where they hold, read as "built from": `agent = model + instructions + skills + connectors + files`. An agent uses a model. It isn't one.
- Don't call an agent's work a "job". Say work, task, workflow or process.
- Close with an example that shows a difference, not a restatement: "Two agents can use the same model and still behave differently, because their skills and connectors differ."
- No analogy inside a definition. Analogies go in an `<Analogy>`, once per page.
- Define a term once, in the glossary. The glossary links to guides. Guides don't link back into the glossary.

## Card blurbs

The `description` of a resource card in `resources.json`. The schema enforces the first three rules, so a violation fails the tests.

- At most 70 characters.
- No full stop at the end.
- No third person ("Teach users", "people", "learners"). Describe what the resource covers or lets you do.
- Start with an action verb the reader would do.

## Sharing

Say it the same way everywhere. Use `<SharingNote />`, which renders:

> You can share with individual people, not groups. They must have logged in to MyAssist at least once.

## Formatting and punctuation

- Bold is rare. Use it only for the control a reader clicks in a numbered step, such as Select **Save Changes**. Don't bold list labels, tab names, option names or terms. If a sentence needs bold to land, rewrite it. Bold renders at medium weight.
- `Code` for paths, file names, identifiers and short snippets. If it would look wrong without a monospace font, use it.
- Never use em dashes or hyphens as punctuation. Use a colon, comma or full stop, or rephrase.
- Curly quotes, `…` rather than three dots, and a non-breaking space in `10 MB`.
- Three or more list-shaped items in a sentence become a list. Introduce lists with a colon. No full stop on items unless they are full sentences. Use `- **Term**: description`.
- Don't hard-wrap paragraphs. One paragraph is one line of source.
- No `---` rules between sections. One blank line before each heading.
- Link text names the destination. Never "here" or "link".
- Code blocks have a language tag and stay under 25 lines.
- Placeholders in prose use `snake_case`: `your_access_token_here`.

## Components

All are available in any article without an import. See [how to add content](myassist_academy_how_to_add_content.md#components) for the syntax.

| Component | Use it for |
|---|---|
| `<TryThis>` | The try-this cue |
| `<Analogy>` | The one analogy a page may have |
| `<Compare>` with `<Before>` and `<After>` | A weaker and stronger version side by side |
| `<CardGrid>` and `<Card>` | Hand-offs, options, what you can build |
| `<Steps>` | A numbered procedure |
| `<Terms>` and `<Term>` | Glossary entries |
| `<FeedbackLink>` | A link to the feedback form |
| `<SharingNote />` | The sharing statement |

## Anchors and links

- Anchors come from `##` and `###` heading text: lowercase, with other characters turned into dashes. "Share a skill" is `#share-a-skill`.
- Keep headings plain text. A code span or link inside a heading gets no anchor.
- Link to the section, not the page: `/learn/articles/guides/skills#share-a-skill`.
- Use the same heading names across guides (**What it is**, **Why it matters**, **Share a skill**) so anchors are predictable.
- Heading ids must be unique within an article. The content tests check this and check that every `/learn/articles/...` link resolves.

## Checklist

- [ ] Frontmatter has `title`, `updated`, `type` and `summary`
- [ ] The summary is one sentence that states the substance
- [ ] Title follows a pattern, sentence case, eight words or fewer
- [ ] Every section opens with a one-sentence summary
- [ ] "MyAssist" only, and generic nouns are lowercase
- [ ] No em dashes, banned words, rhetorical questions or bold used for emphasis
- [ ] Sentences under 20 words
- [ ] Every page except the introduction ends with a `closing` cue
- [ ] No "X vs Y" section; contrasts live in the glossary
- [ ] Links point at sections, and the content tests pass
- [ ] Card blurb is at most 70 characters, with no full stop and no third person
