# Prompt & Skill Categories

## Purpose

Prompts and Skills share a single category taxonomy, served by `GET /api/categories` and
consumed on the frontend via the `useCategories` hook. This file documents how to add,
rename, or remove a category so all three places that must stay in sync are updated together.

## How To

Adding a new category requires changes in all three of the following files:

1. `packages/data-schemas/src/methods/categories.ts` — add a `{ label, value }` entry to the
   `options` array. `value` is the stored category id; `label` is an i18next key following the
   `com_ui_<value>` convention.
2. `client/src/components/Prompts/utils/CategoryIcon.tsx` — add an entry for the new `value`
   to both `categoryIconMap` (a `lucide-react` icon, imported with the `X as XIcon` alias
   convention already used in that file) and `categoryColorMap` (a Tailwind text-colour class).
3. `client/src/locales/en/translation.json` — add the `com_ui_<value>` key from step 1 with
   its display label.

Removing a category is the reverse: delete the `options` entry, the icon/colour map entries,
and the now-unused translation key. Leaving any of these behind causes CI to flag unused
i18next keys.

## Known Gaps

- There is currently no migration path for existing PromptGroups/Skills stored with a
  category `value` that has since been removed from `options` — they will render as
  uncategorised. See the `TODO` in `categories.ts`.
- Skills do not yet have a category taxonomy distinct from Prompts. See the second `TODO` in
  `categories.ts`.
