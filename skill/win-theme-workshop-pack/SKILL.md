---
name: win-theme-workshop-pack
description: Build a facilitator-ready win theme workshop pack for a bid, tender or pursuit team who need to agree why they win before drafting the response. Use this skill whenever the user asks to "run a win themes workshop", "build a win theme workshop pack", "prep a session to align the bid team on our win themes", mentions a "value proposition workshop" or "win theme session", or wants to turn RFP/tender signals into sharpened, defensible win themes with a client team or capture team. Structures the session around a four-part win theme formula (client priority + why us + proof + quantifiable benefit), a sourced client-signal map, and a seven-point final-message stress test. Produces a single self-contained HTML deck by default, leveraging the html-slide-deck skill for deck mechanics and the deloitte-australia-design-system skill for styling when those skills are present and the user hasn't asked for different branding or a different format.
---

---
name: win-theme-workshop-pack
description: Build a facilitator-ready win theme workshop pack for a bid, tender or pursuit team who need to agree why they win before drafting the response. Use this skill whenever the user asks to "run a win themes workshop", "build a win theme workshop pack", "prep a session to align the bid team on our win themes", mentions a "value proposition workshop" or "win theme session", or wants to turn RFP/tender signals into sharpened, defensible win themes with a client team or capture team. Structures the session around a four-part win theme formula (client priority + why us + proof + quantifiable benefit), a sourced client-signal map, and a seven-point final-message stress test. Produces a single self-contained HTML deck by default, leveraging the html-slide-deck skill for deck mechanics and the deloitte-australia-design-system skill for styling when those skills are present and the user hasn't asked for different branding or a different format.
---

# Win theme workshop pack

A win theme workshop turns a pile of RFP/tender signals into a small number of sharp, defensible win themes the whole bid team stands behind. This skill produces the **facilitator pack** for that session — the thing the room looks at while the workshop happens. It does not write the win themes themselves; that happens live in the room, and the output is captured afterwards by the companion `win-theme-development` skill (read its `SKILL.md` if you need to explain the end-to-end flow to the user).

Read `references/framework.md` before building anything — it has the exact formula, signal-map definitions and final-check questions this pack is built around. Treat that framework as fixed IP: don't reinvent the four-part formula or the seven checks, just populate them with this pursuit's content.

`assets/example-deck.html` is a genericised worked example (structure, CSS and JS only — the client content is placeholder text). Open it to see the pattern before building; don't ship it as-is.

## Step 1 — Understand the pursuit (blocking)

Ask, or find in the workspace, before drafting slide content:

1. **Which pursuit is this for?** Client name, what's being procured, and where the source material lives (an RFP, addenda, Q&A, market briefings, prior account intelligence). If the workspace has a converted "original request" or "source material" folder, search it — don't ask the user to retype things that are already on disk.
2. **Who's in the room and how long do they have?** Default to 30 minutes for a 4-slide pack (agenda, priorities pressure-test, formula + signal map, final check). Longer sessions can add an "industry/context challenges" slide (see the example deck's pattern) if there's genuine external evidence to ground it in — don't add it just to fill time.
3. **Output format.** Default is a single-file HTML deck. If the user wants slides in PowerPoint, a printable one-pager, or plain Markdown instead, adapt the same content structure to that format rather than forcing HTML.

Don't stall on this — infer sensible defaults from context and confirm briefly rather than interrogating the user with every question up front.

## Step 2 — Build the sourced signal map

This is the highest-value part of the pack, and the part most likely to be wrong if rushed. For each candidate client priority:

- Decide **primary** (stated explicitly, repeated, or directly scored in evaluation criteria) versus **secondary** (implied by a requirement, risk or constraint) — see `references/framework.md` for the exact test.
- Cite the source for every signal — document name, clause, question number, or page. A signal with no citation is a guess; either find the citation or drop it.
- Aim for a similar count on each side (roughly 6-10 each) so the map reads as a considered pass over the material, not a cherry-picked list.

If the user hasn't supplied source material and none exists in the workspace, say so plainly and offer to proceed with clearly-marked placeholder signals rather than inventing citations.

## Step 3 — Lay out the pack

Standard 4-slide shape (add or drop slides only for good reason):

1. **Title + agenda** — session purpose in one sentence, timed agenda (context → priorities → build & pressure-test themes).
2. **Industry/context challenges** *(optional)* — only include if there's real external evidence (regulator reports, market data, media coverage) that changes how the room should read the client's priorities. Structure as challenge columns with a "so what" callout, following the example deck's pattern.
3. **Priorities + win theme formula + signal map** — put the four-part formula front and centre as the thing the room will fill in live, then show the signal map underneath as the evidence base.
4. **Final check** — reproduce the seven-point check and believability test from `references/framework.md` verbatim. This slide doesn't change between pursuits.

## Step 4 — Generate the artefact

- Check whether the `html-slide-deck` and `deloitte-australia-design-system` skills exist as sibling folders in the skills catalog. If both are present and the user hasn't specified different branding or a different deliverable, use `html-slide-deck`'s deck template and workflow (its Step 1 branding questions can default straight to the Deloitte design system without re-asking, since that's this skill's default) and apply the Deloitte design system's tokens and non-negotiables (square corners, Open Sans, Green Dot, flat 1px-bordered cards).
- If either skill isn't available, or the user wants something else, build the same four-slide content structure directly — `assets/example-deck.html` is self-contained (inline CSS/JS, no build step, keyboard/swipe nav, fullscreen toggle) and can be adapted without those skills.
- Never fabricate the source citations in the signal map to make the deck look more complete — an honest, sparser signal map is more useful in the room than a padded one.

## Step 5 — Sanity-check before handing it over

- Every signal on the map has a citation.
- The final-check slide matches `references/framework.md` word for word.
- The deck opens by double-click with no build step, and slide count matches what was agreed in Step 1.
- Tell the user the pack captures the *workshop*, not the *themes* — remind them to run `win-theme-development` afterwards on the session transcript/notes to turn what's agreed in the room into the document that drives the actual response.
