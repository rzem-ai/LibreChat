# Goal 🎯

Why does this PR exist? What problem does it solve? What value does it add to the repo or the business?

# Description ℹ️

Describe your changes and link to any documentation, code files or issues that are relevant.

# How Should Reviewers Test Your Changes? 🧪

Describe the steps required to test your changes, including any setup or configuration needed. Give exact terminal commands and example prompts where relevant.

1. `docker compose build --no-cache api` to rebuild the api image with this PR's changes
2. `docker compose up` to start the application
3. ...

# Checklist ✅

**Only tick items that have actually been completed! It's okay not to tick something, and we can discuss further in a code review session.**

## Code Cleanliness
- [ ] I based my PR on the latest `develop` branch and resolved any merge conflicts
- [ ] I read through my PR and reviewed all of my changes myself
- [ ] I used [conventional commits](https://www.bavaga.com/blog/2025/01/27/my-ultimate-conventional-commit-types-cheatsheet/) (e.g. feat, fix, refactor) to commit my changes
- [ ] I named this PR with a clear and descriptive title, starting with FEAT, FIX, REFACTOR, CHORE, DOCS or TEST
- [ ] I wrote and commented my code for maximum clarity (see [tips](https://www.py4u.org/python-tutorial/best-practices-for-documenting-python-code-effectively/))
- [ ] I can confidently explain the changes made in this PR and how they work
- [ ] My PR buddy can confidently explain the changes made in this PR and how they work

## Testing
- [ ] I tested my changes locally using the steps above and confirmed changes work as expected (include screenshots below, if applicable)
- [ ] I created tests for my changes which pass successfully
- [ ] I created at least one integration test (without monkey patching)
- [ ] I added or updated manual tests in the `manual testing suites` folder for any user-visible change (see its README and the `deloitte-manual-test-drafter` skill), or this PR has no user-visible change

## Documentation
- [ ] I added any new .env variables to the end of the `.env.example` file, and explained them in the `deloitte/README.md` file
- [ ] I wrote documentation on major changes in the `docs` folder