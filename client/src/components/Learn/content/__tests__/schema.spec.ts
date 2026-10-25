import { BlurbSchema, ResourceSchema } from '../schema';
import { RESOURCES } from '../data';

describe('BlurbSchema', () => {
  it('accepts a short blurb with no full stop', () => {
    expect(BlurbSchema.safeParse('Write clearer prompts with the GCSE method').success).toBe(true);
  });

  it('accepts a blurb of exactly 70 characters', () => {
    expect(BlurbSchema.safeParse('a'.repeat(70)).success).toBe(true);
  });

  it('rejects a blurb over 70 characters', () => {
    expect(BlurbSchema.safeParse('a'.repeat(71)).success).toBe(false);
  });

  it('rejects a trailing full stop', () => {
    expect(BlurbSchema.safeParse('Write clearer prompts.').success).toBe(false);
  });

  it.each(['Teach users to write prompts', 'Help people find skills', 'Guidance for learners'])(
    'rejects third-person wording in "%s"',
    (blurb) => {
      expect(BlurbSchema.safeParse(blurb).success).toBe(false);
    },
  );

  it('does not reject words that merely contain a banned word', () => {
    expect(BlurbSchema.safeParse('Use the Peopleware checklist').success).toBe(true);
  });
});

describe('ResourceSchema', () => {
  it('applies the blurb rules to the description', () => {
    const resource = {
      id: 'x',
      title: 'X',
      description: 'Ends with a full stop.',
      type: 'article',
      tags: [],
    };

    expect(ResourceSchema.safeParse(resource).success).toBe(false);
  });

  it('is satisfied by every resource in resources.json', () => {
    RESOURCES.forEach((resource) =>
      expect(BlurbSchema.safeParse(resource.description).success).toBe(true),
    );
  });
});
