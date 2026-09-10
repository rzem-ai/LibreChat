/**
 * Validation helpers for the tutorial state update endpoint.
 *
 * Kept in packages/api (TypeScript) per repo workspace conventions so that
 * the /api JS controller remains a thin HTTP wrapper with no business logic.
 */

/** Keys that must never appear in a user-supplied object to prevent prototype pollution. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Valid star-rating range (inclusive). */
const RATING_MIN = 1;
const RATING_MAX = 5;

export interface TutorialStateUpdate {
  tutorialPromptSeen?: boolean;
  tutorialRatings?: Record<string, number>;
}

export type TutorialStateValidationResult =
  | { error: string }
  | { empty: true }
  | { update: TutorialStateUpdate };

/**
 * Validates and sanitises a tutorial state update request body.
 *
 * Returns:
 *   - `{ error }` — the request should be rejected with HTTP 400
 *   - `{ empty: true }` — no valid fields found; reject with HTTP 400
 *   - `{ update }` — a clean, safe update object ready for the DB
 */
export function validateTutorialStateUpdate(body: unknown): TutorialStateValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a plain object' };
  }

  const raw = body as Record<string, unknown>;
  const update: TutorialStateUpdate = {};

  // --- tutorialPromptSeen ---
  if ('tutorialPromptSeen' in raw) {
    if (typeof raw.tutorialPromptSeen !== 'boolean') {
      return { error: 'tutorialPromptSeen must be a boolean' };
    }
    update.tutorialPromptSeen = raw.tutorialPromptSeen;
  }

  // --- tutorialRatings ---
  if ('tutorialRatings' in raw) {
    const ratings = raw.tutorialRatings;

    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
      return { error: 'tutorialRatings must be a plain object' };
    }

    const ratingsMap = ratings as Record<string, unknown>;
    const sanitised: Record<string, number> = {};

    for (const [key, value] of Object.entries(ratingsMap)) {
      // Reject prototype-pollution-style keys
      if (DANGEROUS_KEYS.has(key)) {
        return { error: `Invalid rating key: "${key}"` };
      }

      // Validate value is an integer within the 1–5 range
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < RATING_MIN ||
        value > RATING_MAX
      ) {
        return {
          error: `Rating for "${key}" must be an integer between ${RATING_MIN} and ${RATING_MAX}`,
        };
      }

      sanitised[key] = value;
    }

    update.tutorialRatings = sanitised;
  }

  // Reject requests that contain no valid fields
  if (Object.keys(update).length === 0) {
    return { empty: true };
  }

  return { update };
}
