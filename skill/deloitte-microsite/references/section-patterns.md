# Section Patterns

Copy-paste HTML+CSS blocks for each section type. Read only the patterns you need.

**Index**
1. [Hero](#1-hero)
2. [Overview / About](#2-overview--about)
3. [Feature / Card grid](#3-feature--card-grid)
4. [Timeline / Schedule](#4-timeline--schedule)
5. [Team / Speakers](#5-team--speakers)
6. [Resources / Links](#6-resources--links)
7. [CTA / Register](#7-cta--register)
8. [Stats bar](#8-stats-bar)
9. [Two-column content](#9-two-column-content)
10. [Accordion / FAQ](#10-accordion--faq)

---

## 1. Hero

Full-width dark opening section. Always the first section after nav.

```html
<section class="hero section-pad" id="home">
  <div class="container">
    <span class="eyebrow eyebrow--light">{{EYEBROW_LABEL}}</span>
    <h1>{{HEADLINE}} <span class="accent--light">{{HEADLINE_ACCENT}}</span></h1>
    <p class="hero__sub">{{HERO_SUBHEADING}}</p>
    <div class="hero__actions">
      <a href="#{{CTA_ANCHOR}}" class="btn btn--primary">{{CTA_PRIMARY}}</a>
      <a href="#{{INFO_ANCHOR}}" class="btn btn--ghost">{{CTA_SECONDARY}}</a>
    </div>
  </div>
</section>
```

**Usage notes:**
- Replace `{{EYEBROW_LABEL}}` with a short context phrase, e.g. `Deloitte Engineering · 2026`.
- `{{HEADLINE_ACCENT}}` is the key word or phrase — rendered in `--brand`.
- Remove `btn--ghost` entirely if there is only one CTA.
- The green gradient overlay is already on `.hero::before` in the template.

---

## 2. Overview / About

Two-column: prose + stat block. Use when the site needs a brief "what is this?" section.

```html
<section class="overview section-pad" id="about">
  <div class="container">
    <div class="overview__layout">
      <div class="overview__copy">
        <span class="eyebrow">About</span>
        <h2>{{SECTION_HEADLINE}} <span class="accent">{{SECTION_ACCENT}}</span></h2>
        <p>{{BODY_TEXT_1}}</p>
        <p>{{BODY_TEXT_2}}</p>
      </div>
      <div class="overview__stats">
        <div>
          <div class="stat">{{STAT_1_VALUE}}</div>
          <div class="stat__label">{{STAT_1_LABEL}}</div>
        </div>
        <div>
          <div class="stat">{{STAT_2_VALUE}}</div>
          <div class="stat__label">{{STAT_2_LABEL}}</div>
        </div>
        <div>
          <div class="stat">{{STAT_3_VALUE}}</div>
          <div class="stat__label">{{STAT_3_LABEL}}</div>
        </div>
        <div>
          <div class="stat">{{STAT_4_VALUE}}</div>
          <div class="stat__label">{{STAT_4_LABEL}}</div>
        </div>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- Use `--brand-dark` color on `.stat` for green emphasis.
- Replace stat entries with actual figures; omit any unused `<div>` pairs.

---

## 3. Feature / Card grid

Use for 3–6 key topics, modules, capabilities, or service areas.

```html
<section class="features section-pad" id="features">
  <div class="container">
    <div class="features__header">
      <span class="eyebrow">{{EYEBROW}}</span>
      <h2>{{HEADLINE}} <span class="accent">{{HEADLINE_ACCENT}}</span></h2>
    </div>
    <div class="grid-3">
      <div class="card card--top">
        <div class="card__title">{{CARD_1_TITLE}}</div>
        <p class="card__body">{{CARD_1_BODY}}</p>
      </div>
      <div class="card card--top">
        <div class="card__title">{{CARD_2_TITLE}}</div>
        <p class="card__body">{{CARD_2_BODY}}</p>
      </div>
      <div class="card card--top">
        <div class="card__title">{{CARD_3_TITLE}}</div>
        <p class="card__body">{{CARD_3_BODY}}</p>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- Change `.grid-3` to `.grid-2` or `.grid-4` to match the number of cards.
- Cards with important caveats or risks use `.card--accent` (blue top border) or `.card--dark`.
- Add a `<span class="pill">{{TAG}}</span>` after `.card__body` for categorisation labels.

### Card with icon variant

Uses the `.resource-item__icon` class from the base template as a reusable icon wrapper (40×40 px, `--light-bg` background, `--brand-dark` color). No extra CSS needed.

```html
<div class="card card--top">
  <div class="resource-item__icon" style="margin-bottom:1rem;" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <!-- insert Lucide icon path here -->
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  </div>
  <div class="card__title">{{CARD_TITLE}}</div>
  <p class="card__body">{{CARD_BODY}}</p>
</div>
```

---

## 4. Timeline / Schedule

Vertical timeline for programs, events, or step sequences.

```html
<section class="timeline section-pad" id="schedule">
  <div class="container">
    <span class="eyebrow">{{EYEBROW}}</span>
    <h2 style="margin-bottom:2.5rem;">{{HEADLINE}} <span class="accent">{{HEADLINE_ACCENT}}</span></h2>
    <ul class="timeline__list">
      <li class="timeline__item">
        <div class="timeline__date">{{DATE_1}}</div>
        <div class="timeline__title">{{EVENT_1_TITLE}}</div>
        <p class="timeline__desc">{{EVENT_1_DESC}}</p>
      </li>
      <li class="timeline__item">
        <div class="timeline__date">{{DATE_2}}</div>
        <div class="timeline__title">{{EVENT_2_TITLE}}</div>
        <p class="timeline__desc">{{EVENT_2_DESC}}</p>
      </li>
      <li class="timeline__item">
        <div class="timeline__date">{{DATE_3}}</div>
        <div class="timeline__title">{{EVENT_3_TITLE}}</div>
        <p class="timeline__desc">{{EVENT_3_DESC}}</p>
      </li>
    </ul>
  </div>
</section>
```

**Usage notes:**
- Add or remove `<li class="timeline__item">` blocks as needed.
- `{{DATE_N}}` examples: `Monday 12 May`, `Week 1 · 9–10 AM AEST`, `Phase 1`.
- To highlight the "current" step, add `style="--brand-dark: var(--brand);"` on `.timeline__item::before` or add a `.is-current` modifier.

---

## 5. Team / Speakers

Named contributors with name, role, and optional bio.

```html
<section class="team section-pad" id="team">
  <div class="container">
    <span class="eyebrow">{{EYEBROW}}</span>
    <h2 style="margin-bottom:2.5rem;">{{HEADLINE}}</h2>
    <div class="grid-3">
      <div class="team-card">
        <div class="team-card__avatar">{{INITIALS_1}}</div>
        <div class="team-card__name">{{NAME_1}}</div>
        <div class="team-card__role">{{ROLE_1}}</div>
        <p class="team-card__bio">{{BIO_1}}</p>
      </div>
      <div class="team-card">
        <div class="team-card__avatar">{{INITIALS_2}}</div>
        <div class="team-card__name">{{NAME_2}}</div>
        <div class="team-card__role">{{ROLE_2}}</div>
        <p class="team-card__bio">{{BIO_2}}</p>
      </div>
      <div class="team-card">
        <div class="team-card__avatar">{{INITIALS_3}}</div>
        <div class="team-card__name">{{NAME_3}}</div>
        <div class="team-card__role">{{ROLE_3}}</div>
        <p class="team-card__bio">{{BIO_3}}</p>
      </div>
    </div>
  </div>
</section>
```

**Usage notes:**
- `{{INITIALS_N}}` is 1–2 uppercase letters shown as the avatar fallback (e.g. `JA`).
- If an `<img>` is available, replace the inner content of `.team-card__avatar` with `<img src="path/to/photo.jpg" alt="Name" style="width:100%;height:100%;object-fit:cover;">`.
- Bio is optional — remove `<p class="team-card__bio">` if not needed.

---

## 6. Resources / Links

Download links, external docs, or reference materials.

```html
<section class="resources section-pad" id="resources">
  <div class="container">
    <span class="eyebrow">{{EYEBROW}}</span>
    <h2 style="margin-bottom:2rem;">{{HEADLINE}}</h2>
    <div>
      <div class="resource-item">
        <div class="resource-item__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div style="flex:1;">
          <div class="resource-item__title">{{RESOURCE_1_TITLE}}</div>
          <div class="resource-item__desc">{{RESOURCE_1_DESC}}</div>
        </div>
        <a href="{{RESOURCE_1_URL}}" class="resource-item__link" target="_blank" rel="noopener">Download ↗</a>
      </div>
      <div class="resource-item">
        <div class="resource-item__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        </div>
        <div style="flex:1;">
          <div class="resource-item__title">{{RESOURCE_2_TITLE}}</div>
          <div class="resource-item__desc">{{RESOURCE_2_DESC}}</div>
        </div>
        <a href="{{RESOURCE_2_URL}}" class="resource-item__link" target="_blank" rel="noopener">View ↗</a>
      </div>
    </div>
  </div>
</section>
```

---

## 7. CTA / Register

Prominent call-to-action block. Always on a dark background.

```html
<section class="cta-section section-pad" id="register">
  <div class="container">
    <span class="eyebrow eyebrow--light">{{EYEBROW}}</span>
    <h2>{{HEADLINE}} <span class="accent--light">{{HEADLINE_ACCENT}}</span></h2>
    <p>{{CTA_BODY_TEXT}}</p>
    <a href="{{CTA_URL}}" class="btn btn--primary">{{CTA_BUTTON_LABEL}}</a>
  </div>
</section>
```

**Usage notes:**
- `{{CTA_URL}}` can be an external registration link, a `mailto:` address, or a `#` anchor.
- Add a second `btn--ghost` alongside if there is a secondary action (e.g. "Learn more").
- Keep body text under 2 sentences — this is a conversion block, not a content section.

---

## 8. Stats bar

A horizontal row of key figures. Use as a standalone band between other sections.

```html
<section style="background:var(--dark);color:var(--white);padding:3rem 0;" id="stats">
  <div class="container">
    <div class="grid-4" style="text-align:center;">
      <div>
        <div class="stat" style="color:var(--brand);">{{STAT_1}}</div>
        <div class="stat__label" style="color:var(--gray-light);">{{LABEL_1}}</div>
      </div>
      <div>
        <div class="stat" style="color:var(--brand);">{{STAT_2}}</div>
        <div class="stat__label" style="color:var(--gray-light);">{{LABEL_2}}</div>
      </div>
      <div>
        <div class="stat" style="color:var(--brand);">{{STAT_3}}</div>
        <div class="stat__label" style="color:var(--gray-light);">{{LABEL_3}}</div>
      </div>
      <div>
        <div class="stat" style="color:var(--brand);">{{STAT_4}}</div>
        <div class="stat__label" style="color:var(--gray-light);">{{LABEL_4}}</div>
      </div>
    </div>
  </div>
</section>
```

---

## 9. Two-column content

Prose on the left, supplementary content (list, image placeholder, quote) on the right.

```html
<section class="section-pad" id="{{SECTION_ID}}" style="background:var(--light-bg);">
  <div class="container">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,5vw,5rem);align-items:start;">
      <div>
        <span class="eyebrow">{{EYEBROW}}</span>
        <h2>{{HEADLINE}}</h2>
        <p>{{BODY_TEXT_1}}</p>
        <p>{{BODY_TEXT_2}}</p>
        <a href="{{LINK_URL}}" class="btn btn--outline" style="margin-top:1.5rem;">{{LINK_LABEL}}</a>
      </div>
      <div>
        <!-- Option A: Ordered list -->
        <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.25rem;counter-reset:steps;">
          <li style="display:flex;gap:1rem;counter-increment:steps;">
            <span style="width:2rem;height:2rem;background:var(--brand);color:var(--white);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;flex-shrink:0;"
                  aria-hidden="true">1</span>
            <div>
              <div style="font-weight:700;margin-bottom:0.25rem;">{{STEP_1_TITLE}}</div>
              <p style="margin:0;color:var(--gray-mid);">{{STEP_1_DESC}}</p>
            </div>
          </li>
          <li style="display:flex;gap:1rem;">
            <span style="width:2rem;height:2rem;background:var(--brand);color:var(--white);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;flex-shrink:0;"
                  aria-hidden="true">2</span>
            <div>
              <div style="font-weight:700;margin-bottom:0.25rem;">{{STEP_2_TITLE}}</div>
              <p style="margin:0;color:var(--gray-mid);">{{STEP_2_DESC}}</p>
            </div>
          </li>
        </ol>
        <!-- Option B: Pull quote (replace Option A if preferred) -->
        <!--
        <blockquote style="border-left:4px solid var(--brand);padding:1.25rem 1.5rem;background:var(--white);">
          <p style="font-size:1.15rem;font-weight:300;color:var(--charcoal);line-height:1.65;max-width:none;margin:0 0 0.75rem;">
            "{{QUOTE_TEXT}}"
          </p>
          <cite style="font-size:0.82rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--brand-dark);font-style:normal;">
            — {{QUOTE_AUTHOR}}, {{QUOTE_ROLE}}
          </cite>
        </blockquote>
        -->
      </div>
    </div>
  </div>
</section>
```

**CSS to add to `{{SECTION_STYLES}}`** if the two-column layout needs to collapse:

```css
@media (max-width: 768px) {
  #{{SECTION_ID}} > .container > div {
    grid-template-columns: 1fr;
  }
}
```

---

## 10. Accordion / FAQ

Expandable question-and-answer pairs.

```html
<section class="section-pad" id="faq" style="background:var(--white);">
  <div class="container">
    <span class="eyebrow">{{EYEBROW}}</span>
    <h2 style="margin-bottom:2rem;">{{HEADLINE}}</h2>
    <div class="accordion" style="max-width:800px;">
      <details class="accordion__item">
        <summary class="accordion__q">{{QUESTION_1}}</summary>
        <div class="accordion__a"><p>{{ANSWER_1}}</p></div>
      </details>
      <details class="accordion__item">
        <summary class="accordion__q">{{QUESTION_2}}</summary>
        <div class="accordion__a"><p>{{ANSWER_2}}</p></div>
      </details>
      <details class="accordion__item">
        <summary class="accordion__q">{{QUESTION_3}}</summary>
        <div class="accordion__a"><p>{{ANSWER_3}}</p></div>
      </details>
    </div>
  </div>
</section>
```

**CSS to add to `{{SECTION_STYLES}}`:**

```css
.accordion__item {
  border-bottom: 1px solid var(--border);
}
.accordion__item:first-child {
  border-top: 1px solid var(--border);
}
.accordion__q {
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem 0;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--charcoal);
  user-select: none;
}
.accordion__q::-webkit-details-marker { display: none; }
.accordion__q::after {
  content: '+';
  font-size: 1.25rem;
  font-weight: 300;
  color: var(--brand-dark);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
details[open] .accordion__q::after {
  transform: rotate(45deg);
}
.accordion__a {
  padding: 0 0 1.25rem;
}
.accordion__a p {
  color: var(--gray-mid);
  font-size: 0.95rem;
  margin: 0;
}
```
