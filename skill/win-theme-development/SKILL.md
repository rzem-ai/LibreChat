---
name: win-theme-development
description: Turn the raw transcript, notes or recording summary from a win theme workshop into a detailed, source-cited win-themes.md that becomes the authoritative document driving the actual proposal/response. Use this skill when the user has just run a win theme workshop (often built with the win-theme-workshop-pack skill) and says things like "here's the transcript, write up our win themes", "capture what we agreed in the workshop", "turn these notes into our win themes doc", or hands over a recording summary, whiteboard photo transcription, or rough notes from a bid/pursuit session and needs it turned into a polished per-theme write-up with proof, quantifiable benefit and follow-up actions. Do not use for drafting the workshop pack itself — that's the companion win-theme-workshop-pack skill.
---

---
name: win-theme-development
description: Turn the raw transcript, notes or recording summary from a win theme workshop into a detailed, source-cited win-themes.md that becomes the authoritative document driving the actual proposal/response. Use this skill when the user has just run a win theme workshop (often built with the win-theme-workshop-pack skill) and says things like "here's the transcript, write up our win themes", "capture what we agreed in the workshop", "turn these notes into our win themes doc", or hands over a recording summary, whiteboard photo transcription, or rough notes from a bid/pursuit session and needs it turned into a polished per-theme write-up with proof, quantifiable benefit and follow-up actions. Do not use for drafting the workshop pack itself — that's the companion win-theme-workshop-pack skill.
---

# Win theme development

The workshop is where a bid team *agrees* win themes out loud; this skill is where those themes get written down properly so response writers, reviewers and storyboard owners can build the actual proposal from them. Treat the output as the single source of truth for "why we win" — every executive summary, cover letter and theme-carrying section of the response should trace back to this file rather than restating things from memory.

Read `../win-theme-workshop-pack/references/framework.md` if present (it holds the exact four-part formula and seven-point final check this skill writes up against) — the two skills share the same framework so a theme sketched live and the theme documented afterwards use identical language. If that skill isn't installed, `references/framework-summary.md` in this skill has the same content.

## The one rule that matters more than formatting

**Only write down what was actually said or agreed.** If the transcript has someone saying "we'd need to check with the cyber team on that" or "I think we have a reference site but I'm not sure," that's an **open action**, not proof. Fabricating or rounding up evidence to make a theme look more complete defeats the entire point of this document — a response writer who trusts a proof point that doesn't actually exist will put it in front of the client. When the transcript is ambiguous or silent on one of the four formula elements, say so explicitly (e.g. "Proof: not yet established — see action register") rather than inventing something plausible.

## Step 1 — Read the whole transcript before writing anything

Don't extract theme-by-theme on a single pass through a long transcript — themes are often discussed out of order, revisited, and refined later in the session. Read (or skim thoroughly) end to end first, and note:

- How many distinct win themes were actually discussed or agreed, versus floated and dropped.
- Where the four formula elements (client priority, why us, proof, quantifiable benefit) were addressed for each theme, even if scattered across the transcript.
- Every place someone raised a follow-up, a doubt, a "let's confirm", or assigned an owner — these become the action register, not part of the theme itself.
- Whether the final-check questions and believability test were actually run in the room, and what the verdict was for each theme. If they weren't run, note that as a gap rather than running them yourself on the team's behalf — the believability test only means something if the actual bid team judged it.

## Step 2 — Cross-check against source material

Response claims need to trace to something real. If the workspace has converted RFP/tender source material (an "original request" or similar folder), search it for the clause, requirement ID, or evaluation criterion each theme's client priority and proof points reference, and add that citation even if the transcript speaker didn't state it precisely. Follow whatever grounding rules the repository's own instructions set out (e.g. don't invent facts, commitments or credentials; verify significant wording against source documents) — this skill's output is exactly the kind of claim those rules exist to protect.

## Step 3 — Write `win-themes.md`

Use this structure. Keep it as one file unless the user asks for themes to be split out individually.

```markdown
# Win themes — [pursuit name]

*Captured from the win theme workshop held [date]. This document drives the response — proposal sections should cite it rather than restate reasoning from scratch. Any element marked "not yet established" is an open gap, not a placeholder to fill with invented content.*

## Theme 1: [short, specific theme title — not a generic slogan]

- **Client priority:** [in the client's language, with a source citation]
- **Why us:** [the differentiator — specific and hard for a competitor to claim just as easily]
- **Proof:** [the actual evidence, example or demonstration discussed — or "not yet established"]
- **Quantifiable benefit:** [baseline → measure → timeframe, or "not yet quantified"]
- **Final check:** [one line per question that was actually tested in the room, or "not run in workshop"]
- **Believability test verdict:** [pass/fail, and why]

## Theme 2: ...

## Evidence and actions register

| # | Action | Owner | Due | Raised against | Source (transcript timestamp/speaker) |
|---|---|---|---|---|---|

## Open questions and risks raised in the session

- [anything flagged as unresolved, contested, or needing sign-off before it can be used in the response]
```

Adjust theme count to whatever was actually discussed — don't pad to a "nice" number like 3 or 5 if the workshop only firmly landed on 2.

## Step 4 — Validate before handing it over

- Every theme has all four formula elements addressed, even if some say "not yet established" rather than being silent.
- Every proof point and quantifiable benefit is something that was actually said in the transcript or corroborated against source material in Step 2 — not inferred or invented.
- The action register captures every follow-up raised in the transcript, with an owner if one was named.
- File has a single H1 and reads as something a response writer could open cold and immediately use — not a summary that requires them to go back to the transcript.
