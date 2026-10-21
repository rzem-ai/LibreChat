# MyAssist Academy: how to add content

All Academy content lives in `client/src/components/Learn/content/`. It is bundled at build time, so there is no backend or CMS. Add the file, then rebuild (or let `npm run frontend:dev` hot-reload).

| To add a... | Put it in | Then |
|---|---|---|
| Article | `articles/<slug>.mdx` | Add an entry to `resources.json` |
| Release note | `releases/<name>.mdx` | Nothing else |
| FAQ | `faqs.json` | Nothing else |
| Resource card | `resources.json` | Nothing else |
| Tour | `tours/<name>.json` | Import it in `registry.ts` (see limitation below) |

Files starting with `_` are placeholders. Delete or replace them before launch.

## Article

1. Create `articles/<slug>.mdx`. The file name is the slug (`/learning/articles/<slug>`).
2. Start it with frontmatter, then write the body in Markdown. Each `##` heading appears in the "On this page" list.

   ```mdx
   ---
   title: What is the agentic ecosystem
   updated: 2 September 2026
   durationLabel: 6 min read
   ---

   Intro paragraph.

   ## First section
   ```

3. Add a card for it to `resources.json` so it shows under All resources:

   ```json
   {
     "id": "agentic-ecosystem",
     "title": "What is the agentic ecosystem",
     "description": "One line shown on the card.",
     "type": "article",
     "tags": ["Getting started"],
     "durationLabel": "6 min read",
     "updated": "2 September 2026"
   }
   ```

   For articles, `id` must match the `.mdx` file name (it is also the URL slug). `tags` are searchable but not displayed.

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

Add an object to `resources.json`. `type` decides what a click does:

- `article`: opens the article. `id` must match the `.mdx` file name.
- `external`: opens `externalHref` in a new tab. Needs `externalHref`.
- `tour`: starts the tour. `id` must match a tour `id`.

## Tour

1. Create `tours/<name>.json`:

   ```json
   {
     "id": "connectors-guide",
     "title": "Connectors",
     "description": "One line shown on the card.",
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

2. Import it in `registry.ts` and add it to the `TOURS` array. Exactly one tour must have `"isGettingStartedTour": true`; it is shown first as the hero card.

**Limitation:** every tour card currently launches the Getting Started tour. `LearningTourContext` only knows how to start that one, so a new tour will display with its own title and progress chip but will not run its own steps until the context is generalised to start a tour by id.

## Checks

The content tests validate the files above (valid frontmatter, every article `id` has an MDX file, one Getting Started tour, unique tour ids):

```
cd client && npx jest src/components/Learn/content
```

Bad frontmatter or a malformed JSON entry also throws when the Academy loads, because every file is parsed with zod (`content/schema.ts`).
