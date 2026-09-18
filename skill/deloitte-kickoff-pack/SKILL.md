---
name: deloitte-kickoff-pack
description: Build a customer-facing Deloitte kickoff microsite by preparing kickoff content and
  delegating visual design and HTML generation to the deloitte-microsite skill.
  Use when the user asks for a kickoff pack, kickoff site, kickoff deck, or says
  "create a Deloitte microsite".
---

# deloitte-kickoff-pack

Create a reusable kickoff content workflow for any customer.

This skill intentionally avoids embedded design systems, CSS templates, and page implementation details. It focuses on content preparation and orchestration, then hands off microsite generation to `deloitte-microsite`.

## When to invoke this skill

Trigger phrases:
- "build a kickoff pack"
- "create a kickoff deck"
- "kickoff site for the customer"
- "project kickoff presentation"
- "create a Deloitte microsite"

If the user asks to "create a Deloitte microsite", invoke `deloitte-microsite` directly.

## Step 1 - Gather kickoff inputs

Collect or infer:
- Project / engagement name
- Client name
- Engagement type and summary
- Commercial model and duration
- Deloitte team and client team
- Scope and out-of-scope
- Timeline and milestones
- Dependencies and pre-conditions
- Risks and open items
- Next steps and owners

Required kickoff fields:
- `engagementType`: discovery, implementation, migration, uplift, managed service, or hybrid
- `engagementSummary`: plain-English summary
- `commercialModel`: fixed price, T&M, hybrid, or milestone-based
- `duration`: total duration in weeks and any fixed dates
- `deloitteTeam`: names, roles, responsibilities, email (if provided)
- `clientTeam`: names, roles, responsibilities, email (if provided)
- `scopeIn`: concrete activities and deliverables
- `scopeOut`: explicit exclusions
- `timeline`: week-by-week or phase-by-phase milestones
- `dependencies`: owner, required-by date, status
- `risks`: impact and mitigation
- `nextSteps`: action, owner, due date

If source documents exist (PDF, DOCX, PPTX), convert with `markitdown` first. If `markitdown` fails for a file, fall back to `docling`.

If document conversion is used, extract:
- Engagement objective and business outcomes
- Scope boundaries and assumptions
- Team roster and governance roles
- Timeline, workshops, and decision points
- Dependencies and risks
- Commercial cues (pricing model, invoicing cadence, approval gates)

## Step 2 - Build normalized kickoff content

Prepare a concise brief with these sections:
- Agenda
- Introduction (team)
- Current to target state
- Scope
- Out of scope
- Timeline
- Workshop schedule
- Dependencies
- What success looks like
- Governance
- Key design topics
- Risks and open items
- Next steps

Keep all content customer-agnostic and based on provided project inputs. Do not hardcode prior customer examples.

Section detail expectations:
- `Agenda`: 45-60 minute kickoff flow with timings, topic, presenter, and objective
- `Introduction`: engagement purpose, expected outcomes, Deloitte team, client team
- `Current to target state`: current pain points, target outcomes by phase end, future state
- `Scope`: activities and deliverables separated clearly
- `Out of scope`: explicit exclusions to prevent ambiguity
- `Timeline`: phase or week plan with milestones and sign-off points
- `Workshop schedule`: workshop name, attendees, objective, duration, timing window
- `Dependencies`: table with dependency, owner, required-by date, and status
- `What success looks like`: measurable outcomes by checkpoint
- `Governance`: cadence, escalation path, reporting, acceptance process
- `Key design topics`: decisions, options, recommendation direction, required stakeholder input
- `Risks and open items`: severity, impact, mitigation, owner
- `Next steps`: immediate actions with owner and due date

Output shape for normalized content:
- Use concise headings and bullet points.
- Use tables where owner/date/status tracking is needed.
- Use placeholders when data is missing (for example: `[Owner]`, `[Date]`, `[TBD]`).
- Avoid implementation-level UI instructions.

## Step 3 - Delegate to deloitte-microsite

Invoke `deloitte-microsite` with:
- Purpose: customer kickoff microsite
- Audience: customer stakeholders
- Tone: Deloitte professional
- Output: single self-contained HTML file
- Sections: the normalized kickoff sections from Step 2

Include these handoff constraints:
- Keep wording customer-specific only where input data provides names.
- Preserve placeholders for missing information rather than inventing details.
- Keep layout polished and presentation-ready for stakeholder consumption.

Use the handoff intent phrase: "create a Deloitte microsite".

## Step 4 - Output requirements

Return:
1. Path to generated HTML file
2. Assumptions/placeholders used
3. Missing inputs requiring follow-up
4. Short summary of engagement type, model, duration, and top 3 immediate actions

## Notes

- This skill owns kickoff content preparation and orchestration only.
- `deloitte-microsite` owns visual design, layout, and HTML implementation.
