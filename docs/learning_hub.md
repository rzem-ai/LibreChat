# Learning Hub

This document explains how the current Learning Hub implementation works and how to extend it safely.

## Current architecture

The Learning Hub is currently a **static frontend implementation**. It does not load course definitions or tour steps from MongoDB, a CMS, or a backend API.

The main files are:

- `client/src/components/Learning/courses.ts` — course catalog
- `client/src/components/Learning/LearningPanel.tsx` — renders the course list in the sidebar
- `client/src/components/Learning/Courses/useGettingStartedTour.ts` — step-by-step content and ordering for the current guided tour
- `client/src/components/Learning/LearningTourContext.tsx` — starts the tour and tracks in-session completion UI state
- `client/src/locales/en/translation.json` — user-facing English strings used by the Learning Hub UI and tour
- `librechat.yaml` → `interface.customDeloitteFeatureFlags.isTutorialEnabled` — deployment kill switch for the Learning Hub

## 1. How to add to the course list

Add a new entry to the `COURSES` array in:

- `client/src/components/Learning/courses.ts`

Each course currently has:

- `title` — stable user-facing course title
- `description` — user-facing course summary
- `estimatedMinutes` — optional duration shown in the UI
- `comingSoon` — whether the course is available yet

### Example

```ts
{
  id: 'new-course-id',
  titleKey: 'com_learning_course_new_title',
  descriptionKey: 'com_learning_course_new_description',
  estimatedMinutes: 5,
  comingSoon: false,
}
```

You would then add the matching English strings in:

- `client/src/locales/en/translation.json`

## Is it safe to reuse an old course ID?

**Usually no. Treat course IDs as permanent identifiers.**

Reasons:

- Ratings are stored in MongoDB by `courseId` under the user's `tutorialRatings` map.
- Reusing an old ID for a different course would make the new course inherit the old course's stored ratings.
- Any future analytics, persistence, or completion tracking tied to course IDs would also become ambiguous.

### Safe rule

- **Do not reuse an old ID for a different course.**
- If a course is materially new, give it a new ID.
- Only keep the same ID if the course is fundamentally the same course and you intentionally want to preserve its rating history.

## 2. How to populate a course with content

Today, the only fully implemented course is the Getting Started Tour.

### Course card content

The card shown in the Learning Hub sidebar comes from:

- the course entry in `courses.ts`
- the English strings in `translation.json`

### Guided tour content

The actual tour steps live in:

- `client/src/components/Learning/Courses/useGettingStartedTour.ts`

That file defines:

- the step order
- the DOM target for each step
- the title and description shown in each popover
- the completion callback when the tour finishes

To add a new real course, you currently need to:

1. Add the course metadata to `courses.ts`
2. Add the user-facing strings to `translation.json`
3. Add a tour implementation for that course
4. Wire the course's button to start the correct tour

## Important current limitation

Right now `LearningPanel.tsx` starts the current Getting Started course via `startGettingStartedTour()`.

That means adding a course to `courses.ts` alone does **not** create a working new tutorial. A second real course would require additional wiring so the selected course starts its own tour definition instead of always starting the Getting Started Tour.

## 3. How course completion and ratings are stored

### Prompt visibility

The “show this tutorial prompt once” state is stored on the MongoDB user document as:

- `tutorialPromptSeen: boolean`

Schema location:

- `packages/data-schemas/src/schema/user.ts`

The frontend updates it through:

- `POST /api/user/tutorial`

Controller location:

- `api/server/controllers/UserController.js`

### Ratings

Course ratings are stored on the MongoDB user document as:

- `tutorialRatings: Record<string, number>`

In MongoDB this is persisted as a map keyed by `courseId`, for example:

```json
{
  "tutorialPromptSeen": true,
  "tutorialRatings": {
    "getting-started-guide": 5
  }
}
```

Ratings are submitted from the UI after completion and sent to:

- `POST /api/user/tutorial`

The controller merges new ratings into the existing map instead of overwriting the whole object.

### Completion

A dedicated persistent `tutorialCompleted` field does **not** currently exist.

Current behavior:

- in-session completion is tracked in the client via `completedCourseId` in `LearningTourContext.tsx`
- this is used to show the completion modal after the tour ends
- once the page/app state is gone, that completion state is gone too

So today:

- **prompt seen** is persisted
- **ratings** are persisted
- **course completion itself** is only tracked in memory for the current session

## MongoDB / deployment notes

MongoDB here is schema-flexible, so deploying Helm charts does not run SQL-style add/drop column migrations.

Practical effect:

- new schema fields do not get backfilled into every existing document automatically on deploy
- fields appear on documents when application code writes them
- fields are not automatically removed from documents just because code or config changes

For this feature, `tutorialPromptSeen` and `tutorialRatings` will be created on user documents when the app writes them.

## Suggested safe workflow when adding a new course

1. Pick a **new, stable course ID**
2. Add the course metadata in `courses.ts`
3. Add English strings in `translation.json`
4. Implement the new tour steps in code
5. Wire the course card to the correct starter function
6. Verify the DOM targets exist in the intended layout and viewport sizes
7. Confirm rating submissions write to the expected `courseId`

## Future improvement ideas

If the Learning Hub grows beyond a small MVP, likely next steps would be:

- store course definitions in a structured config instead of scattered constants
- support multiple tour starter functions instead of a single hard-coded course flow
- add a persistent course completion field or completion history if completion tracking matters independently of ratings
- consider an admin-managed or CMS-backed content model if non-developers need to update tutorials
