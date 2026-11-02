# Release Summary: v7.0.2

PR [#1128](<repo-url>/pull/1128) — Merge: Develop into Main (7.0.2)
414 commits, 301 files changed, `develop` → `main`.

## 🎓 MyAssist Academy (Guided Tours first pass)
- A new guided tour walks you through key features the first time you log in.
- Rate tutorials and leave feedback directly in the app, with your ratings and progress saved.
- Course completion is now tracked, with a completion screen when you finish a course.

## 🔗 Connectors & MCP
- SharePoint connectors now show a "Limited Access" label when your access is restricted, driven by admin config.
- Files shared via a SharePoint connector (e.g. through `sp_download_file`) can now be sent straight into Code Interpreter from a chat, without leaving the conversation.
- Code files carried over from another conversation are now handled correctly when attached as documents.
- Connector icons in the side panel no longer go missing for MCP servers that use separate light/dark logo variants.
- Agent Builder now proactively discovers on-behalf-of (OBO) MCP tools instead of requiring a manual refresh.
- SSO login now forces a fresh profile fetch, fixing stale-session edge cases after re-authenticating.

## 📚 Citations & Knowledge Sources
- Citations no longer get corrupted or mismatched inside code blocks, quoted text, or tables — anchors now land in the right place every time.
- Citation chips and tooltips now show the source's connector logo and publication/upload date.
- KX and DPN disclaimers are now combined into a single, clearer message (renamed "KX" → "KX & DPN").
- New SharePoint MCP citations: sources are now parsed and matched even when the model paraphrases the title, duplicate citations from the same source are merged into one chip, and citations are guaranteed for IBISWorld and other disclaimer-bearing sources instead of sometimes being dropped.

## 🌐 Web Search
- Native web search can now be toggled per model, with a pin control to keep it enabled across chats.
- The list of models offering web search has been cleaned up to only show supported options.

## 💪 Skills
- New DAIS and OfficeCLI skills are available.
- Skill uploads now require filenames without spaces, avoiding upload issues.
- Skill zip uploads built on a Mac no longer fail — macOS-only artifacts (`__MACOSX/`, `.DS_Store`) are stripped before the skill is scanned.
- New and updated deployment skills (e.g. proposal-cv-refiner).

## ⚙️ Internal / Infrastructure
- Hardened the SharePoint-to-Code-Interpreter bridge against SSRF, DNS rebinding, and proxy bypasses.
- Hardened `mcp.js` against XSS and added HSTS.
- Playwright e2e tests now support SSO login (#589).
- Bumped `rag_api` dependencies (`unstructured`, `pypdf`, `nltk`), `sharp`, and `nodemailer`.
- Disabled OTel metrics/logs exporters by default.
- Routine Docker image tag updates and Deloitte custom-changes CSV tracking commits — no functional changes.
