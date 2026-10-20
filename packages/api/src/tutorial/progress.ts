import {
  MAX_TOUR_STEP_ID_LENGTH,
  MAX_TOUR_STEP_TITLE_LENGTH,
  type TTourProgressUpdate,
} from 'librechat-data-provider';
import { MAX_RATING_KEY_LENGTH } from './tutorialState';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_TOUR_STEPS = 1000;

export type TourProgressValidationResult =
  | { error: string }
  | { courseId: string; progress: TTourProgressUpdate };

type RawProgress = Partial<Record<keyof TTourProgressUpdate, unknown>>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TOUR_STEPS;

const isValidCourseId = (courseId: unknown): courseId is string =>
  typeof courseId === 'string' &&
  courseId.length > 0 &&
  courseId.length <= MAX_RATING_KEY_LENGTH &&
  !courseId.startsWith('$') &&
  !courseId.includes('.') &&
  !DANGEROUS_KEYS.has(courseId);

/** Returns the trimmed string, `undefined` when absent or blank, and `null` when invalid. */
const optionalString = (value: unknown, max: number): string | undefined | null => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed || undefined;
};

/** Validates and sanitises a single-tour progress update request body. */
export function validateTourProgressUpdate(body: unknown): TourProgressValidationResult {
  if (!isPlainObject(body)) {
    return { error: 'Request body must be a plain object' };
  }
  const { courseId, progress } = body;
  if (!isValidCourseId(courseId)) {
    return { error: 'Invalid courseId' };
  }
  if (!isPlainObject(progress)) {
    return { error: 'progress must be a plain object' };
  }

  const raw: RawProgress = progress;
  if (!isCount(raw.step) || !isCount(raw.total)) {
    return { error: 'step and total must be non-negative integers' };
  }
  if (typeof raw.completed !== 'boolean') {
    return { error: 'completed must be a boolean' };
  }

  const stepId = optionalString(raw.stepId, MAX_TOUR_STEP_ID_LENGTH);
  const stepTitle = optionalString(raw.stepTitle, MAX_TOUR_STEP_TITLE_LENGTH);
  if (stepId === null || stepTitle === null) {
    return { error: 'stepId and stepTitle must be short strings' };
  }

  return {
    courseId,
    progress: {
      step: raw.step,
      total: raw.total,
      completed: raw.completed,
      ...(stepId ? { stepId } : {}),
      ...(stepTitle ? { stepTitle } : {}),
    },
  };
}
