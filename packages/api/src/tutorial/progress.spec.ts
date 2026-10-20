import { toTutorialStateResponse } from './tutorialState';
import { validateTourProgressUpdate } from './progress';

const valid = {
  courseId: 'getting-started',
  progress: { step: 2, total: 9, stepId: 'projects', stepTitle: ' Projects ', completed: false },
};

describe('validateTourProgressUpdate', () => {
  it('accepts a valid update and trims the step title', () => {
    expect(validateTourProgressUpdate(valid)).toEqual({
      courseId: 'getting-started',
      progress: { step: 2, total: 9, stepId: 'projects', stepTitle: 'Projects', completed: false },
    });
  });

  it('allows steps without an id or title', () => {
    const result = validateTourProgressUpdate({
      courseId: 'tour',
      progress: { step: 0, total: 3, completed: false },
    });
    expect(result).toEqual({
      courseId: 'tour',
      progress: { step: 0, total: 3, completed: false },
    });
  });

  it.each(['', '$set', 'a.b', '__proto__', 'x'.repeat(65), 42, undefined])(
    'rejects courseId %p',
    (courseId) => {
      expect(validateTourProgressUpdate({ ...valid, courseId })).toEqual({
        error: 'Invalid courseId',
      });
    },
  );

  it.each([null, [], 'str'])('rejects a non-object body %p', (body) => {
    expect(validateTourProgressUpdate(body)).toHaveProperty('error');
  });

  it('rejects a non-object progress', () => {
    expect(validateTourProgressUpdate({ courseId: 'tour', progress: [] })).toHaveProperty('error');
  });

  it.each([
    { step: -1, total: 9 },
    { step: 1.5, total: 9 },
    { step: '2', total: 9 },
    { step: 2, total: 100000 },
    { step: 2 },
  ])('rejects bad counts %p', (counts) => {
    const result = validateTourProgressUpdate({
      courseId: 'tour',
      progress: { ...counts, completed: false },
    });
    expect(result).toHaveProperty('error');
  });

  it('rejects a non-boolean completed', () => {
    const result = validateTourProgressUpdate({
      courseId: 'tour',
      progress: { step: 1, total: 2, completed: 'yes' },
    });
    expect(result).toEqual({ error: 'completed must be a boolean' });
  });

  it('rejects overlong or non-string step metadata', () => {
    const tooLong = { ...valid.progress, stepTitle: 'x'.repeat(201) };
    const wrongType = { ...valid.progress, stepId: 7 };
    expect(validateTourProgressUpdate({ ...valid, progress: tooLong })).toHaveProperty('error');
    expect(validateTourProgressUpdate({ ...valid, progress: wrongType })).toHaveProperty('error');
  });
});

describe('toTutorialStateResponse tutorialProgress', () => {
  it('defaults to an empty object', () => {
    expect(toTutorialStateResponse({}).tutorialProgress).toEqual({});
  });

  it('converts a Mongoose Map into a plain object', () => {
    const progress = { step: 1, total: 3, completed: false };
    const response = toTutorialStateResponse({ tutorialProgress: new Map([['tour', progress]]) });
    expect(response.tutorialProgress).toEqual({ tour: progress });
  });
});
