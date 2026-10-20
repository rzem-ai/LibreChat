# Plan: make Academy guided tours robust

Status: proposal. Written against PR #1527 (`feature/learning-tasks-create-plan`). Intended to be picked up here or merged into the other workspace working on tours.

## Problems observed

1. **Silent skipping.** `useCourseTour` sets `skipMissingElement: true`. A step whose target is not in the DOM is dropped, so the counter jumps (prompts tour 2 to 11, skills tour 2 to 8, connectors skips 3 and 5).
2. **Tours depend on user state.** Targets inside dialogs, menus, a selected prompt/skill or a sent message only exist after the user acts. Next does not open anything for them.
3. **Spotlight ("lightbox") unreliable.** Suspected causes, unconfirmed:
   - driver.js measures with `animate: false` while dialogs are still animating in.
   - Modal dialogs (Radix) carry their own overlay, z-index and focus trap, and block pointer events outside themselves, so the spotlight and tour card can sit behind them or not be clickable.
   - Targets in scrolling or portalled containers are measured before layout settles.
4. **Mixed selector conventions.** Tour targets were a mix of app `id`s, `useId` ids, `data-testid` and `data-tour`.

## Done in this PR (consistency only)

- Every tour-specific target is a `data-tour="<name>"` attribute. App ids that already existed (`#nav-panel-*`, `#prompt-name`, `#create-skill-name`, `#prompt-textarea`, toolbar toggles) are used as-is.
- Exceptions kept as ids because they are menu items without attribute passthrough: `#create-skill-write`, `#create-skill-upload`.
- `AgentSelect` is wrapped in `<div data-tour="agent-select">` because `ControlCombobox` cannot take extra attributes.
- `clickOnNext` (schema + `useCourseTour`) opens a dialog or menu when Next is pressed.

## Proposed work

1. **One convention, one source of truth.** Keep `data-tour` for tour-specific targets. Add a typed `TOUR_TARGETS` map (in `Learn/content`) and a `tourTarget(name)` helper used by components, so a typo is a type error. Add a Jest test that every `data-tour` name in `tours/*.json` exists in component source.
2. **Never skip silently.** Set `skipMissingElement: false`. When a target is missing, show the step's text as a centred card (a driver.js step with no `element`), so the counter never jumps and the instruction is still shown.
3. **Prepare steps, don't assume state.** Extend `clickOnNext` into a small `prepare` contract per step (click, wait-for, navigate). Steps that need a selected prompt/skill or a sent message should say so in the previous step or be split into their own short tour.
4. **Fix the spotlight.**
   - After `clickOnNext` or any dialog open, wait until the target's bounding box is stable for two frames, then call `refresh()`.
   - Render the tour overlay and card above modal dialogs and keep the card outside the focus trap and `pointer-events` lock.
   - Reproduce on each dialog step (create prompt, create skill, share) before changing anything.
5. **Split stateful tours.** Sharing Skills and Agents becomes two tours, each beginning with a step that asks the user to select an item.
6. **Optional:** a Playwright smoke test that walks each tour and fails on a skipped or centred fallback step.

## Open questions

- Is the spotlight problem the dialog timing, the dialog layering, or both? A screenshot of one broken step settles this.
- Should the sharing tours stay in the first release?
