/**
 * Validation helpers for the tutorial state update endpoint.
 *
 * Kept in packages/api (TypeScript) per repo workspace conventions so that
 * the /api JS controller remains a thin HTTP wrapper with no business logic.
 */

import { MAX_TUTORIAL_RATINGS } from '@librechat/data-schemas';

// Re-export so callers that previously imported from @librechat/api continue to work.
export { MAX_TUTORIAL_RATINGS };

/** Keys that must never appear in a user-supplied object to prevent prototype pollution. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Valid star-rating range (inclusive). */
const RATING_MIN = 1;
const RATING_MAX = 5;

/**
 * Maximum byte-length for a single rating key (course ID).
 *
 * The entry-count cap (MAX_TUTORIAL_RATINGS = 50) bounds the number of keys
 * but not their size — an authenticated caller could otherwise submit very
 * long IDs and bloat the user document. Real course IDs are short slugs
 * (e.g. "getting-started-guide" = 21 chars); 64 chars gives ample headroom.
 * Mirrors the MAX_KEY_LENGTH = 64 pattern used in skillStates.ts.
 */
export const MAX_RATING_KEY_LENGTH = 64;

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
      // Enforce cap on total number of ratings
      if (Object.keys(sanitised).length >= MAX_TUTORIAL_RATINGS) {
        return { error: `tutorialRatings cannot exceed ${MAX_TUTORIAL_RATINGS} entries` };
      }

      // Reject empty or oversized keys — bounds per-entry storage so an
      // authenticated caller cannot bloat the user document by submitting
      // arbitrarily large course IDs (document-size limit is 16 MB BSON).
      if (key.length === 0 || key.length > MAX_RATING_KEY_LENGTH) {
        return { error: `Invalid rating key: "${key}"` };
      }

      // Reject MongoDB-illegal key characters: leading $ (operator injection)
      // and dot (dot-notation path traversal)
      if (key.startsWith('$') || key.includes('.')) {
        return { error: `Invalid rating key: "${key}"` };
      }

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

/**
 * Shapes a user document into the tutorial state response body.
 *
 * Defensively converts tutorialRatings from a Mongoose Map to a plain object
 * before serialisation — JSON.stringify(Map) produces {} which would silently
 * drop all stored ratings. getUserById/updateUser both call .lean() today so
 * the Map branch is currently unreachable, but the guard protects against
 * future refactors that return a hydrated Mongoose document instead.
 */
export function toTutorialStateResponse(user: {
  tutorialPromptSeen?: boolean | null;
  tutorialRatings?: Map<string, number> | Record<string, number> | null;
}): { tutorialPromptSeen: boolean; tutorialRatings: Record<string, number> } {
  const tutorialRatings =
    user.tutorialRatings instanceof Map
      ? Object.fromEntries(user.tutorialRatings)
      : (user.tutorialRatings ?? {});
  return {
    tutorialPromptSeen: !!user.tutorialPromptSeen,
    tutorialRatings,
  };
}
