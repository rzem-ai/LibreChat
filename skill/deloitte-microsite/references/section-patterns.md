# Section patterns

Copy-paste HTML blocks built on the `.gel-*` classes and `--gel-*` tokens
defined in `design-tokens.md` and wired up in `assets/microsite-template.html`.
Read only the patterns you need for this build — per
`composition-principles.md`, don't include a section just because it's in
this file.

Every pattern already respects `banned-patterns.md` (sentence case, no
gradients, radius from tokens, one primary button, brand green reserved for
interaction). Fill in `{{PLACEHOLDER}}` content; don't add hardcoded colours.

**Index**
1. [Nav](#1-nav)
2. [Hero](#2-hero)
3. [Overview / stats](#3-overview--stats)
4. [Feature / card grid](#4-feature--card-grid)
5. [Timeline / schedule](#5-timeline--schedule)
6. [Team / speakers](#6-team--speakers)
7. [Resources / links](#7-resources--links)
8. [Comparison table](#8-comparison-table)
9. [CTA band](#9-cta-band)
10. [Accordion / FAQ](#10-accordion--faq)
11. [Footer](#11-footer)
12. [Status callout](#12-status-callout)

---

## 1. Nav

Already wired into `assets/microsite-template.html` — included here for
reference when editing. `{{LOGO_SVG}}` is the markup in
`assets/deloitte-logo.svg` (the canonical file — never a text-plus-dot
simulation). If the site sits under a specific programme/product name, add
the lockup label next to the logo (mirrors the approved `DeloitteLogoLockup`
pattern) — otherwise omit `.gel-nav__lockup` entirely and let the logo stand
alone.

```html
<nav class="gel-nav dark" aria-label="Main navigation">
  <div class="gel-container gel-nav__inner">
    <a href="#" class="gel-nav__brand" aria-label="Deloitte, home">
      {{LOGO_SVG}}
      <!-- Optional lockup — omit both spans entirely if there's no product name -->
      <span class="gel-nav__divider" aria-hidden="true"></span>
      <span class="gel-nav__lockup">{{SITE_TITLE_SHORT}}</span>
    </a>
    <ul class="gel-nav__links" id="gel-nav-links">
      {{NAV_LINKS}}
    </ul>
    <button class="gel-nav__toggle" id="gel-nav-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="gel-nav-links">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <line x1="3" y1="5" x2="17" y2="5" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="15" x2="17" y2="15" />
      </svg>
    </button>
  </div>
</nav>
```

---

## 2. Hero

Full-width dark band. Always the first section after nav. `{{HERO_LABEL}}`
is a short, sentence-case context line — NOT an uppercase eyebrow.

```html
<section class="gel-band gel-hero dark" id="home">
  <div class="gel-container">
    <p class="gel-hero__label">{{HERO_LABEL}}</p>
    <h1 class="gel-display">{{HEADLINE}}</h1>
    <p class="gel-lead">{{HERO_SUBHEADING}}</p>
    <div class="gel-hero__actions">
      <a href="#{{CTA_ANCHOR}}" class="gel-btn gel-btn--primary gel-btn--lg">{{CTA_PRIMARY}}</a>
      <a href="#{{INFO_ANCHOR}}" class="gel-btn gel-btn--outline gel-btn--lg">{{CTA_SECONDARY}}</a>
    </div>
  </div>
</section>
```

**Usage notes:**
- Remove the second `<a>` entirely if there's only one CTA — never leave a
  secondary button with no real destination just to balance the layout.
- `{{HEADLINE}}` should state the reader's job in plain language, not name
  the document type (avoid "Welcome to the Program Microsite").
- Primary + outline is the default secondary-CTA pairing (a bordered,
  green-text button beside the filled one) — reach for ghost only when the
  second action is genuinely low-emphasis (e.g. "Skip for now"), not as the
  default hero pairing.
- `gel-btn--lg` on both buttons here is deliberate — a hero is the one
  place in the page where the default 36px button height reads as
  undersized next to a display headline. Everywhere else, the default size
  is correct.

---

## 3. Overview / stats

Two-column: prose + a stat block. Use when the page needs a brief "what is
this" section with a small number of real figures.

```html
<section class="gel-band" id="about">
  <div class="gel-container gel-overview">
    <div class="gel-overview__copy">
      <h2>{{SECTION_HEADLINE}}</h2>
      <p>{{BODY_TEXT_1}}</p>
      <p>{{BODY_TEXT_2}}</p>
    </div>
    <div class="gel-stat-strip">
      <div class="gel-stat">
        <p class="gel-stat__value">{{STAT_1_VALUE}}</p>
        <p class="gel-stat__label">{{STAT_1_LABEL}}</p>
      </div>
      <div class="gel-stat">
        <p class="gel-stat__value">{{STAT_2_VALUE}}</p>
        <p class="gel-stat__label">{{STAT_2_LABEL}}</p>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- Only include stats you have real values for. Don't pad to a fixed count —
  two honest figures beat four where two are filler.

---

## 4. Feature / card grid

Use for 3–6 key topics, modules, or capabilities — true peers, equal weight.

```html
<section class="gel-band gel-band--muted" id="features">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <div class="gel-grid-3">
      <div class="gel-card">
        <h3 class="gel-card__title">{{CARD_1_TITLE}}</h3>
        <p class="gel-card__body">{{CARD_1_BODY}}</p>
      </div>
      <div class="gel-card">
        <h3 class="gel-card__title">{{CARD_2_TITLE}}</h3>
        <p class="gel-card__body">{{CARD_2_BODY}}</p>
      </div>
      <div class="gel-card">
        <h3 class="gel-card__title">{{CARD_3_TITLE}}</h3>
        <p class="gel-card__body">{{CARD_3_BODY}}</p>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- Swap `.gel-grid-3` for `.gel-grid-2` or `.gel-grid-4` to match the card
  count — never leave an orphaned card alone in the last row if it can be
  avoided by rebalancing the grid.
- If one item is genuinely more important than its peers (e.g. a
  recommended option), it isn't a peer grid any more — give it its own
  layout instead of forcing false parity.
- Only add an icon when it makes the card faster to recognise, not by
  default. Use a Material Symbol (`.gel-icon`, see `design-tokens.md`), not
  a hand-drawn SVG — that's what GEL's real icon components actually are.
  Add the Material Symbols `<link>` to `<head>` the first time a build uses
  one:
  ```html
  <div class="gel-card">
    <span class="gel-icon" aria-hidden="true" style="margin-bottom:0.5rem;">insights</span>
    <h3 class="gel-card__title">{{CARD_1_TITLE}}</h3>
    <p class="gel-card__body">{{CARD_1_BODY}}</p>
  </div>
  ```
  `.gel-icon` defaults to `color: inherit` (the current foreground) — don't
  add `--gel-primary` or `--gel-primary-strong` to a content icon just to
  give it presence. Green is reserved for interactive elements; a card icon
  is informational, not a button.

---

## 5. Timeline / schedule

**Not a GEL component — use only when the content genuinely needs it.**
GEL's only related component is `Stepper` (`packages/core/brand-components/
src/stepper/stepper.tsx`), and it solves a different problem: a horizontal,
interactive wizard/progress indicator with clickable numbered steps
(`activeStep`, `onStepChange`) for a multi-step form the user is currently
in. It is not a read-only list of dated events, so it isn't a real
substitute here. This pattern is a generic, self-authored vertical list —
dot, connector, date, title, description — dressed in `--gel-*` tokens, not
something sourced from a real GEL component the way buttons, cards, and the
accordion are. Reach for it only when the content is genuinely an ordered
sequence of dated steps (a programme schedule, an event agenda); don't
default to including it just because it's in this file — see
`composition-principles.md`.

Vertical timeline for programmes, events, or ordered steps.

```html
<section class="gel-band" id="schedule">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <ul class="gel-timeline">
      <li class="gel-timeline__item">
        <p class="gel-timeline__date">{{DATE_1}}</p>
        <p class="gel-timeline__title">{{EVENT_1_TITLE}}</p>
        <p class="gel-timeline__desc">{{EVENT_1_DESC}}</p>
      </li>
      <li class="gel-timeline__item">
        <p class="gel-timeline__date">{{DATE_2}}</p>
        <p class="gel-timeline__title">{{EVENT_2_TITLE}}</p>
        <p class="gel-timeline__desc">{{EVENT_2_DESC}}</p>
      </li>
    </ul>
  </div>
</section>
```

---

## 6. Team / speakers

```html
<section class="gel-band gel-band--muted" id="team">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <div class="gel-grid-3">
      <div class="gel-team-card">
        <div class="gel-team-card__avatar" aria-hidden="true">{{INITIALS_1}}</div>
        <p class="gel-team-card__name">{{NAME_1}}</p>
        <p class="gel-team-card__role">{{ROLE_1}}</p>
        <p class="gel-team-card__bio">{{BIO_1}}</p>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- If a real photo is available, replace the avatar's initials with
  `<img src="..." alt="{{NAME_1}}" style="width:100%;height:100%;object-fit:cover;">`.
- Bio is optional — drop `<p class="gel-team-card__bio">` if there's nothing
  substantive to say.

---

## 7. Resources / links

```html
<section class="gel-band" id="resources">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <div class="gel-resource">
      <div class="gel-resource__icon" aria-hidden="true">
        <span class="gel-icon">description</span>
      </div>
      <div class="gel-resource__text">
        <p class="gel-resource__title">{{RESOURCE_1_TITLE}}</p>
        <p class="gel-resource__desc">{{RESOURCE_1_DESC}}</p>
      </div>
      <a href="{{RESOURCE_1_URL}}" class="gel-resource__link" target="_blank" rel="noopener">Download</a>
    </div>
  </div>
</section>
```

**Usage notes:**
- `.gel-icon`'s text content is the Material Symbol name (`description`,
  `download`, `link`, etc.) — see `design-tokens.md` for the font-loading
  `<link>` and base rule. Pick the name that matches the resource type.

---

## 8. Comparison table

Use when the reader needs to scan exact values across options — a real
`<table>`, not styled `<div>`s. Numeric columns are right-aligned; text
columns stay left-aligned.

```html
<section class="gel-band" id="compare">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <table class="gel-table">
      <caption class="gel-visually-hidden">{{TABLE_CAPTION}}</caption>
      <thead>
        <tr>
          <th scope="col">{{COLUMN_1_LABEL}}</th>
          <th scope="col" class="gel-numeric">{{COLUMN_2_LABEL}}</th>
          <th scope="col" class="gel-numeric">{{COLUMN_3_LABEL}}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{{ROW_1_LABEL}}</th>
          <td class="gel-numeric">{{ROW_1_VALUE_1}}</td>
          <td class="gel-numeric">{{ROW_1_VALUE_2}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

**Usage notes:**
- Keep units and precision consistent down a column — don't mix "12%" with
  "0.12" in the same column.
- Let the table use the full container width; don't squeeze it into a
  half-width split next to prose if it has five or more columns.

---

## 9. CTA band

Prominent call-to-action, always a dark band. Keep body copy under two
sentences — this is a conversion block, not a content section.

```html
<section class="gel-band gel-cta dark" id="register">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <p class="gel-lead">{{CTA_BODY_TEXT}}</p>
    <a href="{{CTA_URL}}" class="gel-btn gel-btn--primary gel-btn--lg">{{CTA_BUTTON_LABEL}}</a>
  </div>
</section>
```

---

## 10. Accordion / FAQ

Native `<details>`/`<summary>` — no JavaScript needed.

```html
<section class="gel-band" id="faq">
  <div class="gel-container">
    <h2>{{HEADLINE}}</h2>
    <div class="gel-accordion">
      <details class="gel-accordion__item">
        <summary class="gel-accordion__q">
          {{QUESTION_1}}
          <svg class="gel-accordion__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </summary>
        <div class="gel-accordion__a"><p>{{ANSWER_1}}</p></div>
      </details>
      <details class="gel-accordion__item">
        <summary class="gel-accordion__q">
          {{QUESTION_2}}
          <svg class="gel-accordion__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </summary>
        <div class="gel-accordion__a"><p>{{ANSWER_2}}</p></div>
      </details>
    </div>
  </div>
</section>
```

---

## 11. Footer

Already wired into `assets/microsite-template.html`. Matches the real
`Footer` component's structure exactly (`packages/core/brand-components/
src/footer/footer.tsx`) — **no logo**, just a copyright + policy-links row,
then a separate verbatim disclaimer paragraph. The policy links are
deliberately NOT the same set as `{{NAV_LINKS}}` in the nav — don't repeat
the site's section anchors here.

```html
<footer class="gel-footer dark">
  <div class="gel-container">
    <div class="gel-footer__top">
      <span class="gel-footer__copyright">&copy; {{YEAR}} Deloitte Touche Tohmatsu</span>
      <ul class="gel-footer__links">
        <li><a href="#">Privacy policy</a></li>
        <li><a href="#">Terms of use</a></li>
        <li><a href="#">Contact us</a></li>
      </ul>
    </div>
    <p class="gel-footer__legal">
      Deloitte Refers to one or more of Deloitte Touche Tohmatsu Limited, a UK
      private company limited by guarantee ("DTTL"), its network of member
      firms, and their related entities. DTTL and each of its member firms are
      legally separate and independent entities. DTTL (also referred to as
      "Deloitte Global") does not provide services to clients. Please see
      About Deloitte for a detailed description of DTTL and its member firms.
    </p>
  </div>
</footer>
```

**Usage notes:**
- Replace the three `href="#"` placeholders with real policy/contact URLs
  before production (the real component's own documented rule,
  `footer-production-destinations`).
- Never shorten, paraphrase, or "fix" the disclaimer text — it's copied
  verbatim from the real component's default, including its capitalisation.

---

## 12. Status callout

Not a full section — a small inline block for a genuine status message
(e.g. an important date has changed, a form submission failed). Reach for
this rarely; most microsite copy doesn't need a callout at all.

```html
<div class="gel-callout gel-callout--warning">
  <span class="gel-icon gel-callout__icon" aria-hidden="true">warning</span>
  <p>{{CALLOUT_BODY_TEXT}}</p>
</div>
```

**Usage notes:**
- Swap `gel-callout--warning` for `--info`, `--success`, or `--critical`,
  and match the icon name to the status (`info`, `check_circle`, `warning`,
  `error` are reasonable Material Symbols choices).
- The paragraph text stays default foreground/muted colour — never recolour
  it to the status colour. Only the background and the icon carry the
  status.
- Don't reach for `--gel-success` here just because "success" sounds
  positive and brand-adjacent — it's a status token, not a brand accent.
  A congratulatory microsite headline still uses plain typography, not a
  green callout box.
