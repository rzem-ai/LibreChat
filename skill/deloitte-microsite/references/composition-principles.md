# Composition principles

Judgment guidance for deciding which sections a microsite or single-purpose
asset actually needs, and in what order. Tokens and markup patterns are
covered elsewhere (`design-tokens.md`, `section-patterns.md`) — this file is
about the thinking that decides structure, not the CSS.

## Frame the visit before you design anything

Before choosing sections, privately answer:

- Who opens this, and what do they need to walk away knowing or doing?
- What is the single most important action on this page? (Register, read,
  download, apply, learn one fact.)
- What stage is this for — an early internal share, or a public/client-facing
  asset that needs to be polished?

If you can't answer the first two, stop and ask the user rather than
defaulting to a generic template. A microsite with no clear job just becomes
a wall of sections that all look equally important.

## Choose a composition — don't default to hero + card grid

The reflex is: dark hero, three feature cards, timeline, team grid, CTA,
footer. That reflex is fine when it genuinely fits (a training program page
often does need most of those), but it should be a choice, not an autopilot.
Before assembling sections, ask what shape actually fits this content:

- An **event or program page** foregrounds the date, location, and
  registration action — the CTA is not an afterthought at the bottom.
- A **project or initiative recap** foregrounds outcomes and what happened,
  not a generic "about" paragraph.
- A **single-purpose asset** (a one-page brief, a CTA banner, a short
  announcement) may need only two or three of the blocks in
  `section-patterns.md`, not all of them. Don't pad a simple ask into a
  nine-section site because the template has nine sections available.

Every section should answer a question the reader actually has. If two
sections say the same thing in different words (a stats bar repeating the
overview's numbers, a second CTA restating the first), combine them.

## One focal object per section

Each section should have one dominant thing the eye lands on — a headline
and its supporting proof, a single stat row, one clear CTA. If every card in
a grid carries equal weight and none of them is more important than the
others, that's fine for a feature grid; but if one item in a set is genuinely
more important (the primary program date, the recommended option), give it
more visual weight rather than forcing false parity.

Squint test: at a glance, is it obvious what this section is trying to tell
the reader? If every block reads as equally important, the hierarchy hasn't
been established yet — fix it with type scale and spacing before reaching
for a border or a background color.

## Plain language, Australian English

Write for the least specialised reader who will open this page. Define an
unfamiliar term once, then use it consistently. Use Australian spelling:
*organisation*, *optimise*, *programme* (for a training/event context),
*colour*, *behaviour*, *recognised*.

Keep copy short. A microsite's job is to be scanned, not read end to end:
prefer a clear sentence broken into two over one long compound sentence.

Write in active voice and address the reader directly ("you'll get a
confirmation email", not "a confirmation email will be sent" or "the user
will receive"). See `banned-patterns.md` for the rest of the copy rules
(no em dashes, no all-caps kickers, no banned filler words, no rhetorical
questions).

## Restraint pass before delivering

Before handing the file back, look at it once more and ask:

1. **First read** — if someone saw only the first screen, would they know
   what this page is for and what to do next?
2. **Repetition** — is any section saying something another section already
   said? Cut the weaker one.
3. **Can anything be removed** — a border, a badge, an icon, a paragraph —
   without losing meaning? If yes, remove it. Restraint is not the same as
   making the page sterile; it means every element that survives is earning
   its place.
4. **Responsive** — does it hold up at mobile width without content
   overlapping or a grid column collapsing into overlap?
5. **Accessibility** — run the checklist in `SKILL.md` step 6 before calling
   it done.

Do this pass silently — deliver the finished file, not a critique of your
own work, unless the user asks to see your reasoning.
