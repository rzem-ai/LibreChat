# MyAssist Academy: how to add content

All Academy content lives in `client/src/components/Learn/content/`. It is bundled at build time, so there is no backend or CMS. Add the file, then rebuild (or let `npm run frontend:dev` hot-reload).

| To add a... | Put it in | Then |
|---|---|---|
| Article | `articles/<slug>.mdx`, or `articles/<folder>/<name>.mdx` | Add an entry to `resources.json` |
| Release note | `releases/<name>.mdx` | Nothing else |
| FAQ | `faqs.json` | Nothing else |
| Resource card | `resources.json` | Nothing else |
| Tour | `tours/<name>.json` | Import it in `registry.ts` (see limitation below) |

Files starting with `_` are placeholders. Delete or replace them before launch.

Write to the [style guide](myassist_academy_style_guide.md). It covers voice, naming, page frames, definitions and card blurbs.

## Article

1. Create `articles/<slug>.mdx`. The path under `articles/`, without the extension, is the slug and the URL: `articles/guides/skills.mdx` is `/learn/articles/guides/skills`. Folders are allowed and a slug may contain `/`.
2. Start it with frontmatter, then write the body in Markdown. Each `##` heading appears in the "On this page" list, and each `###` nests under the `##` above it.

   ```mdx
   ---
   title: Guide to skills
   updated: 22 October 2026
   durationLabel: 6 min read
   type: guide
   summary: One-paragraph TL;DR that leads with the reader's situation and says what the page covers.
   ---

   ## What it is

   Body text.
   ```

   `type` is `concept`, `how-to`, `guide` or `reference`. `summary` is shown as the lede under the title. Both are optional in the schema but the style guide expects them. The card `description` in `resources.json` is separate, because it has a 70-character limit.

3. Add a card for it to `resources.json` so it shows under All resources:

   ```json
   {
     "id": "guides/skills",
     "title": "Guide to skills",
     "description": "Find, trigger, create and share skills for repeatable tasks",
     "type": "article",
     "section": "guides",
     "tags": ["Skills"],
     "durationLabel": "6 min read",
     "updated": "22 October 2026"
   }
   ```

   For articles, `id` must match the path of the `.mdx` file under `articles/`, without the extension (it is also the URL slug). `tags` are searchable but not displayed.

### Anchors

A heading's anchor is its text in lowercase with other characters turned into dashes, so `## Share a skill` is `#share-a-skill`. Headings that hold a code span or link get no anchor, so keep them plain text. Link to a section with `/learn/articles/<slug>#<anchor>`. Renaming a heading breaks links to it. The content tests fail on a link to a missing article or heading, and on duplicate heading ids within an article.

### Components

These are available in every article with no import. Write child text on the same line as the tags for single-line components (`Card`, `Before`, `After`, `Term`). Leave blank lines inside `Analogy` and `Steps` so Markdown inside them renders. GitHub-style tables (`| a | b |`) work in articles.

`TryThis` is the try-this cue: the action as plain text, then the prompt in a monospace block with a copy button. `prompt` is the text readers copy, shown without quotation marks. Add `closing` when a **Try this now** heading sits above it, so the label isn't repeated:

```mdx
<TryThis
  action="Rewrite a prompt you've used recently with GCSE"
  prompt={`Goal: Summarise the risks in this proposal.
Context: I'm presenting tomorrow.`}
/>
```

`Analogy` wraps the one analogy a page may have, in a white outlined box with an info icon:

```mdx
<Analogy>

Build your prompt like a layered cake.

</Analogy>
```

`Compare` shows a before and an after side by side in one container, each with a labelled footer (a cross for before, a tick for after):

```mdx
<Compare>
  <Before>Summarise this report.</Before>
  <After>Help me prepare for a client meeting. Use the attached report only.</After>
</Compare>
```

`CardGrid` and `Card` link to other articles (`/learn/...` stays in the app and opens in a new tab on Cmd or middle click) or to external pages (opens in a new tab):

```mdx
<CardGrid>
  <Card href="/learn/articles/guides/prompts" title="Guide to prompts">Save quick prompts for any chat</Card>
  <Card href="https://example.com" title="Read the full article" />
</CardGrid>
```

`Steps` wraps a numbered list and numbers it as a procedure:

```mdx
<Steps>

1. Select **Prompts** from the side menu.
2. Select **Create prompt**.

</Steps>
```

`Terms` and `Term` build glossary entries. Each `Term` gets an anchor from its name (`#connector-mcp`), and `href` adds a "Read the guide" link:

```mdx
<Terms>
  <Term name="Skill" href="/learn/articles/guides/skills#what-it-is">Written instructions for doing one task the same way every time.</Term>
</Terms>
```

`FeedbackLink` links to the feedback form from `interface.learningCenter.feedbackUrl` in `librechat.yaml` and renders nothing when it is unset: `<FeedbackLink>Share feedback about MyAssist</FeedbackLink>`.

`SharingNote` renders the standard sharing statement: `<SharingNote />`.

Plain Markdown links work too. Paths starting with `/` stay in the app; full URLs open in a new tab.

## Release note

Create `releases/<name>.mdx` with frontmatter. Releases are sorted newest first by `date`, so use an ISO date.

```mdx
---
title: Faster file uploads
version: V5.5
date: 2026-09-01
---

Body text.
```

The tab is only visible when `interface.customDeloitteFeatureFlags.learningReleaseNotes` is `true` in `librechat.yaml`.

## FAQ

Append `{ "question": "...", "answer": "..." }` to `faqs.json`. The tab is only visible when `learningCommonQuestions` is `true`.

`answer` can contain Markdown links: `[link text](href)`. An `href` starting with `/` is an in-app route (e.g. `/learn/articles/<slug>`); anything else opens in a new tab.

## Resource card

Add an object to `resources.json`. The same rules apply to the `description` of articles, external links and tours (including the `description` in a tour's own JSON file):

- At most 70 characters. The schema rejects longer descriptions.
- Start with a user-facing action verb, e.g. "Learn how to write clear prompts", "Book a training session with the MyAssist team", "Take a tour of chats, projects and the context panel" or "Access the Lumo Agent in Microsoft Teams". Not "Teach users how to...", because the user isn't doing the teaching!
- No full stop at the end. The schema rejects it.
- Don't refer to users in third person in the description ("Teach users", "people", "learners"); describe what the resource covers or lets you do. The schema rejects those words.

`section` groups the card on the All resources page: `start`, `guides`, `further`, `reference` or `external`. Sections show in that order, and each card follows file order within its section. It is required.

`type` decides what a click does:

- `article`: opens the article. `id` must match the `.mdx` path under `articles/`, without the extension.
- `external`: opens `externalHref` in a new tab. Needs `externalHref`.
- `tour`: starts the tour. `id` must match a tour `id`.

## Tour

1. Create `tours/<name>.json`:

   ```json
   {
     "id": "connectors-guide",
     "title": "Connectors",
     "description": "Take a tour of connecting to approved sources",
     "estimatedMinutes": 3,
     "steps": [
       {
         "element": "#some-element-id",
         "title": "Step title",
         "description": "Step text. Simple HTML such as <strong> is allowed.",
         "side": "right"
       }
     ]
   }
   ```

   Steps whose target only exists after something is opened (a dialog or menu) are skipped when the target is missing. Add `"clickOnNext": ["#selector"]` to the step before them to click those selectors, in order, when Next is pressed.

   `element` is a CSS selector for the thing to highlight. `side` is `top`, `right`, `bottom` or `left`. Add `"comingSoon": true` (with `"steps": []`) to show a disabled card.

   Write the `description` following the [resource card rules](#resource-card): at most 70 characters, starting with an action verb, with no full stop and no mention of users.

2. Import it in `registry.ts` and add it to the `TOURS` array. Exactly one tour must have `"isGettingStartedTour": true`; it is shown first as the hero card.
3. Optionally add a `"type": "tour"` entry to `resources.json` (its `id` must match the tour `id`) to list it under All resources. The Getting Started tour is not listed there because it has its own tab.

**Hiding a tour:** remove its import and its entry in the `TOURS` array in `registry.ts`, and remove its `"type": "tour"` entry from `resources.json` (a tour resource whose `id` is not in `TOURS` fails the content tests). Keep the JSON file so the tour can be restored. Only the Getting Started tour is currently registered; `using-connectors` is hidden. `build-a-skill`, `sharing-skills-and-agents` and `saved-prompts-and-prompt-library` were converted to articles, now `guides/skills`, `guides/agents` and `guides/prompts`; their tour JSON is in git history.

**Limitation:** every tour card currently launches the Getting Started tour. `LearningTourContext` only knows how to start that one, so a new tour will display with its own title and progress chip but will not run its own steps until the context is generalised to start a tour by id.

## Checks

The content tests validate the files above (valid frontmatter, every article `id` has an MDX file, one Getting Started tour, unique tour ids, resolvable article links and anchors, unique heading ids):

```
cd client && npx jest src/components/Learn/content
```

Bad frontmatter or a malformed JSON entry also throws when the Academy loads, because every file is parsed with zod (`content/schema.ts`).
