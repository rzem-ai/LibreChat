# MyAssist Learning Journey: asset tracker

Mirrors the Excel tracker (`MyAssist Learning Journey - Asset Tracker.xlsx`). The first nine columns are copied from it unchanged. **In app** is added here to track what has been built in the Academy.

Rules:
- Article, FAQ and tour text matches the source document word for word. Only structure is converted (headings, lists, links).
- Source copies live in `plans/learning-sources/`.
- Content is added following `docs/myassist_academy_how_to_add_content.md`. Files are in `client/src/components/Learn/content/` (`articles/*.mdx`, `resources.json`, `faqs.json`, `tours/*.json`).
- Nothing is invented. Rows with no source stay empty.

**In app** values: `Done` (added, matches source), `Blocked` (source not accessible), `Needs source`, `Needs URL`, `Tour` (blocked on tour-by-id fix and step content), `Not Academy` (nothing to add in this repo), `Later`.

| Priority | Asset | Description | Format 1 | Format 2 | Responsible for creating | Link / location | Reviewer | Status | In app |
|---|---|---|---|---|---|---|---|---|---|
| Launch essential | What is the agentic ecosystem | | Article in NextGen | Comms + DAIS | Comms - check with Jade, DAIS - Alex | [SharePoint](https://ausdeloitte.sharepoint.com/:w:/s/D.AU-AIMarketActivation-Internal-ClosedSources-FluencyAI/IQB1hiZDLwd3T6mYnkLKfdBZAU8lI1hBvizG7yjQGIovf1w?e=tCO2Nw) | | In review | Done (`articles/agentic-ecosystem.mdx`, source: `learning-sources/what-is-the-agentic-ecosystem.docx`) |
| Launch essential | AI Fluency Skill | Knowledge base of tool agnostic AI terms and capability | Skill/FAQ Agent | | Sunny | | | In review | Not Academy |
| Launch essential | MyAssist in 2 minutes | Introduces MyAssist, what it can help with and where a new user should begin. Avoid UI, high level, conceptually how you use agents and skills, other features, benefits | Article / Visual | | Learning + Comms | To be added | | Not started | Needs source |
| Launch essential | Getting Started Tour | Guides users through the chat interface, navigation and main platform features. | Guided tour | | Sunny; Learning review | MyAssist Academy | | Complete | Done (`tours/getting-started.json`) |
| Launch essential | What should I use? | Use a simple decision guide and practical examples to choose the most suitable capability for a task. | decision guide - article | FAQ Agent | Learning + Sunny | "What should I use? MyAssist FAQs: [SharePoint](https://ausdeloitte.sharepoint.com/:w:/r/sites/AISolutionStudio/Shared%20Documents/MyAssist%20NextGen%20FAQs/MyAssist%20NextGen%20FAQs.docx?d=w1efaab4f674347f9b56e3cede722bfa9&csf=1&web=1&e=R5d6OS)" | | In review | Done (`articles/what-should-i-use.mdx`) |
| Launch essential | Use MyAssist Responsibly | Apply essential human review and verification steps and access authoritative responsible-use guidance. | Linked resources | | MyAssist | Responsible Use of AI Guide - Leaders and Employees; Internal AI Usage Statement and AI Guidance | | Existing asset to link | Needs URL |
| Launch essential | Choosing the right model | Supports model selection based on the task, complexity, reasoning and data requirements. | Hover feature | | Ally implemented Kevin's designs | | | Complete | Not Academy |
| Launch essential | Book in with a MyAssist Team Member | Provides a clear route to request or book a training session with the MyAssist team. | Link | | MyAssist | [Bookings](https://bookings.cloud.microsoft/book/Deloitte_MyAssistGeniusBar_Bookings@deloitte.onmicrosoft.com/?ismsaljsauthenabled) | | Existing asset to link | Done (`book-myassist-team` external card) |
| Launch essential | Use your first skill and your first agent | Find, open and use an existing skill, then review and refine the result. | Guided Tour | | Sunny with support with content (Mahiba or Rachel) | To be added | | Not started | Needs source (tour) |
| Launch essential | Write an effective prompt | Use a simple pattern covering goal, context, source material, constraints and output format. | article or downloadable job aid | | Learning | Write an effective prompt | | In review | Done (`articles/write-an-effective-prompt.mdx`) |
| Launch essential | Build an Agent | Introduces Agent creation using instructions, Skills, connectors and files. | Guided tour + live session | | Sunny; Learning - Live Session | How to build an agent | | In review | Needs source (no doc yet) |
| Launch essential | Understanding connectors | Explains when approved external information or systems are needed. | Article + guided tour | | MyAssist team; Learning review | Connectors | | In review | Done (`articles/connectors.mdx`, `tours/using-connectors.json`) |
| Launch essential | Use prompts and Prompt Library | Explains how to create, save and reuse prompts. | Article + guided tour | | MyAssist team; Learning review | Guided Tour - Saved Prompts and Prompt Library | | In review | Done (`tours/saved-prompts-and-prompt-library.json`) |
| Launch essential | Share Skills and Agents | Explains how capabilities can be prepared and shared with others. | Article | | MyAssist team; Learning review | Sharing Skills and Agents | | In review | Done (`tours/sharing-skills-and-agents.json`) |
| Launch essential | MyAssist drop-ins | Provides practical support for users applying or creating with MyAssist. Test during Beta or use Innovation sessions? | Drop-in session | | MyAssist team + Learning | To be added | | Not started | Not Academy |
| Launch essential | Build a Skill | Guides users through creating a reusable Skill for repeatable work. | Guided tour + live session | | MyAssist team; Learning support | How to build a skill | | In review | Done (`articles/how-to-build-a-skill.mdx` with source placeholders, `tours/build-a-skill.json`) |
| Launch essential | Memory | | FAQ agent | | MyAssist team; learning review | MyAssist FAQs: [SharePoint](https://ausdeloitte.sharepoint.com/:w:/r/sites/AISolutionStudio/Shared%20Documents/MyAssist%20NextGen%20FAQs/MyAssist%20NextGen%20FAQs.docx?d=w1efaab4f674347f9b56e3cede722bfa9&csf=1&web=1&e=R5d6OS) | | In review | Blocked (no access to FAQ doc) |
| High | Artifacts | Explains what Artifacts are, when to use them and how to create, review and refine them in MyAssist, what you can build | Hover feature | Article + FAQs agent | Kevin embedded in MyAssist | MyAssist FAQs: [SharePoint](https://ausdeloitte.sharepoint.com/:w:/r/sites/AISolutionStudio/Shared%20Documents/MyAssist%20NextGen%20FAQs/MyAssist%20NextGen%20FAQs.docx?d=w1efaab4f674347f9b56e3cede722bfa9&csf=1&web=1&e=R5d6OS) | | Not started | Blocked (no access to FAQ doc) |
| High | AI in My Day lab | Helps users apply MyAssist to a current work task through facilitated practice; supports users to create a personalised Skill anchored to real work. | Live session | | Learning + MyAssist support | To be added | | Not started | Not Academy |
| High | Frequently asked questions | Answers recurring questions identified through pilots, support and testing. | FAQ agent | | MyAssist team + Learning + Comms | To be added | | Not started | Needs source |
| High | Lumo Agent - MS Teams | Shows users how to access and use the Lumo Agent within Microsoft Teams. | resource | | MyAssist team | [Teams](https://teams.microsoft.com/l/app/?source=app-bar-share-entrypoint&titleId=T_58ce1182-293d-2351-2d1d-89d7c421103d) | | Existing asset to link | Done (`lumo-ms-teams` external card) |
| High | AI Hub – DAIS | Directs users to AI Hub on DAIS. | Learning resource | | Learning; DAIS content owner | AI Hub - Home | | Existing asset to link | Needs URL |
| High | Code Interpreter | Explains when and how to use Code Interpreter for analysis, calculations and file-based tasks. | FAQ agent | | Sunny | To be added | | Not started | Needs source |
| Medium | Do AI Labs | Practice using AI to solve real workplace challenges and build confidence through experience. | Live lab | | Learning + MyAssist team | To be added | | In development | Not Academy |
| Later release | Organise work using projects | Shows how related conversations can be grouped for ongoing work. - TBC | Article + guided tour | | MyAssist team; Learning support | To be added | | Existing asset to link | Later |

## Open items

- Request access to the MyAssist NextGen FAQs doc (rows: Memory, Artifacts).
- URLs for rows whose link column only has a title (Responsible Use guides, AI Hub), and source docs for Build an Agent, MyAssist in 2 minutes, first skill/agent, Code Interpreter, FAQs.
- Fill the source placeholders in `how-to-build-a-skill` (SKILL.md template, folder structure image) and the tour's template link.
- Article read times and "Updated" dates are placeholders.
- Run the Learn tests and type-check (`cd client && npx jest src/components/Learn`).
