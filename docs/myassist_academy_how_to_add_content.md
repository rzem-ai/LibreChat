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
   title: What is the Agentic Ecosystem?
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
     "title": "What is the Agentic Ecosystem?",
     "description": "Learn how the Agentic Ecosystem powers enterprise AI agents",
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

Add an object to `resources.json`. The same rules apply to the `description` of articles, external links and tours (including the `description` in a tour's own JSON file):

- At most 70 characters.
- Start with a user-facing action verb, e.g. "Learn how to write clear prompts", "Book a training session with the MyAssist team", "Take a tour of chats, projects and the context panel" or "Access the Lumo Agent in Microsoft Teams". Not "Teach users how to...", because the user isn't doing the teaching!
- No full stop at the end.
- Don't refer to users in third person in the description ("Teach users", "people"); describe what the resource covers or lets you do.

`type` decides what a click does:

- `article`: opens the article. `id` must match the `.mdx` file name.
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
3. Add a matching `"type": "tour"` entry to `resources.json` (its `id` must match the tour `id`) so it also appears under All resources.

**Hiding a tour:** remove its import and its entry in the `TOURS` array in `registry.ts`, and remove its `"type": "tour"` entry from `resources.json` (a tour resource whose `id` is not in `TOURS` fails the content tests). Keep the JSON file so the tour can be restored. Only the Getting Started tour is currently registered; `using-connectors` is hidden. `build-a-skill`, `sharing-skills-and-agents` and `saved-prompts-and-prompt-library` were converted to articles (`how-to-build-a-skill`, `sharing-skills-and-agents`, `save-and-share-prompts`); their tour JSON is in git history.

**Limitation:** every tour card currently launches the Getting Started tour. `LearningTourContext` only knows how to start that one, so a new tour will display with its own title and progress chip but will not run its own steps until the context is generalised to start a tour by id.

## Checks

The content tests validate the files above (valid frontmatter, every article `id` has an MDX file, one Getting Started tour, unique tour ids):

```
cd client && npx jest src/components/Learn/content
```

Bad frontmatter or a malformed JSON entry also throws when the Academy loads, because every file is parsed with zod (`content/schema.ts`).
