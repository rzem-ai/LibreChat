# Goal 🎯

Agent Marketplace categories were hardcoded to a fixed set of defaults (`hr`, `rd`, `finance`, `it`, `sales`, `aftersales`, plus the `general` fallback), with no way to configure them per deployment. This PR ports upstream [LibreChat PR #13309](https://github.com/danny-avila/LibreChat/pull/13309) so that marketplace categories can be declared in `librechat.yaml`, and configures this deployment with 5 org-specific categories (`pursue-shape`, `discover-define`, `build-deliver`, `produce-assure`, `resource-grow-people`) in place of the old defaults.

# Description ℹ️

- `packages/data-provider/src/config.ts`: extends `interfaceSchema`'s `marketplace` block with `categories.enableDefaultCategories` (boolean) and `categories.list` (array of `{ value, label?, description? }`), validated by Zod.
- `api/server/utils/agentCategory.js` (new): `syncCategories(customCategoriesList, enableDefaultCategories)` reconciles the `AgentCategory` collection against config on server start — toggles the built-in defaults on/off (the `general` fallback is never deactivated, since agents without a category fall back to it), and creates/updates/deletes custom categories to match the configured list. Mirrors the structure of the upstream PR's own `agentCategory.js`.
- `api/server/services/Config/loadCustomConfig.js`: calls `syncCategories` inside `runAsSystem(...)` whenever `interface.marketplace.use` and `interface.marketplace.categories` are set in config.
- `librechat.yaml`: sets `interface.marketplace.categories.enableDefaultCategories: false` and lists the 5 new categories, replacing the old HR/R&D/Finance/IT/Sales/After Sales tabs with `General` + the 5 new ones.
- `librechat.example.yaml`: documents the new config shape for other deployments.
- No frontend changes — `CategoryTabs.tsx` / `AgentCategorySelector.tsx` / `useAgentCategories` already read categories from the DB with no hardcoded list.

# How Should Reviewers Test Your Changes? 🧪

1. `docker compose build --no-cache api` to rebuild the api image with this PR's changes
2. `docker compose up` to start the application
3. Open the Agent Marketplace and confirm the tabs show `General` plus `Pursue & Shape`, `Discover & Define`, `Build & Deliver`, `Produce & Assure`, `Resource & Grow People` (not the old HR/R&D/Finance/IT/Sales/After Sales tabs)
4. Create a new agent without picking a category and confirm it still lands in `General`
5. Automated tests (already run and passing as part of this PR):
   - `cd packages/data-provider && npx jest config.spec.ts`
   - `cd api && npx jest server/utils/agentCategory.spec.js server/services/Config/loadCustomConfig.spec.js`

# Checklist ✅

**Only tick items that have actually been completed! It's okay not to tick something, and we can discuss further in a code review session.**

## Code Cleanliness
- [ ] I based my PR on the latest `develop` branch and resolved any merge conflicts
- [x] I read through my PR and reviewed all of my changes myself
- [ ] I used [conventional commits](https://www.bavaga.com/blog/2025/01/27/my-ultimate-conventional-commit-types-cheatsheet/) (e.g. feat, fix, refactor) to commit my changes
- [ ] I named this PR with a clear and descriptive title, starting with FEAT, FIX, REFACTOR, CHORE, DOCS or TEST
- [x] I wrote and commented my code for maximum clarity (see [tips](https://www.py4u.org/python-tutorial/best-practices-for-documenting-python-code-effectively/))
- [x] I can confidently explain the changes made in this PR and how they work

## Testing
- [ ] I tested my changes locally using the steps above and confirmed changes work as expected (include screenshots below, if applicable)
- [x] I created tests for my changes which pass successfully
- [x] I created at least one integration test (without monkey patching)

## Documentation
- [ ] I added any new .env variables to the end of the `.env.example` file, and explained them in the `deloitte/README.md` file
- [ ] I wrote documentation on major changes in Confluence, and linked it in my code as comments where relevant
- [ ] I listed ALL changes to/additional files outside the `deloitte` directory in the `deloitte/DeloitteCustomChanges.md` file