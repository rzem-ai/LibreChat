import type { ClaimVerifier, SnapshotReader } from '../../src/server/verify';
import type { ISnapshot } from '../../src/db';
import { verifyDraft, locatePassage } from '../../src/server/verify';

const snapshot = (id: string, overrides: Partial<ISnapshot> = {}): ISnapshot => ({
  id,
  sourceKind: 'web',
  reference: `https://example.com/${id}@2026-11-01T00:00:00.000Z`,
  url: `https://example.com/${id}`,
  title: id,
  storageKey: `k/${id}`,
  fileStrategy: 'local',
  contentHash: 'h',
  fetchedAt: new Date('2026-11-01T00:00:00.000Z'),
  archived: false,
  ...overrides,
});

const contents: Record<string, string> = {
  s1: 'Intro paragraph.\n\nPrices rose 4% in Q3 according to the bureau.\n\nOther text.',
  s2: 'Nothing relevant here at all.',
};

const reader: SnapshotReader = {
  read: async (snap) => contents[snap.id] ?? null,
};

/** Supports a claim only when every word of length >= 4 appears in the passage. */
const keywordVerifier: ClaimVerifier = {
  verifyClaim: async ({ claim, passage }) =>
    claim
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4)
      .every((w) => passage.toLowerCase().includes(w)),
  checkScope: async ({ report }) => (report.includes('off-topic') ? 'Report drifts.' : null),
};

describe('locatePassage', () => {
  it('returns the paragraphs that best match the claim', () => {
    const passage = locatePassage(contents.s1, 'Prices rose in Q3', undefined, 50);
    expect(passage).toContain('Prices rose 4% in Q3');
    expect(passage).not.toContain('Intro');
  });

  it('starts at the locator when the snapshot contains it', () => {
    const content = `${'x'.repeat(5000)}\n## Outlook\nGrowth slows.`;
    expect(locatePassage(content, 'Growth slows', 'Outlook', 200)).toContain('Growth slows.');
  });
});

describe('verifyDraft uncited prose', () => {
  it('counts factual sentences written without a citation', async () => {
    const outcome = await verifyDraft({
      draft: 'Prices rose in Q3. [[cite:s1]] The market will double next year without doubt.',
      userId: 'u1',
      maxClaims: 10,
      strict: false,
      getSnapshotsByIds: async (ids: string[]) => ids.map((id) => snapshot(id)),
      reader,
      verifier: keywordVerifier,
    });
    expect(outcome.summary.uncited).toBe(1);
  });
});

describe('verifyDraft', () => {
  const getSnapshotsByIds = jest.fn(async (ids: string[]) =>
    ids.filter((id) => id !== 'gone').map((id) => snapshot(id)),
  );

  beforeEach(() => getSnapshotsByIds.mockClear());

  it('labels each citation supported, unsupported or unavailable and counts them', async () => {
    const draft =
      'Prices rose in Q3. [[cite:s1]] Prices fell sharply. [[cite:s2]] A vanished claim. [[cite:gone]]';
    const outcome = await verifyDraft({
      draft,
      userId: 'u1',
      maxClaims: 10,
      strict: false,
      getSnapshotsByIds,
      reader,
      verifier: keywordVerifier,
    });
    expect(outcome.citations.map((c) => c.state)).toEqual([
      'supported',
      'unsupported',
      'unavailable',
    ]);
    expect(outcome.summary).toMatchObject({
      supported: 1,
      unsupported: 1,
      unavailable: 1,
      total: 3,
    });
    expect(outcome.summary.uncited).toBeUndefined();
    expect(outcome.sentenceStates).toEqual(['supported', 'unsupported', 'unavailable']);
    expect(getSnapshotsByIds).toHaveBeenCalledTimes(1);
    expect(getSnapshotsByIds).toHaveBeenCalledWith(['s1', 's2', 'gone'], 'u1');
  });

  it('marks citations beyond the claim cap as unchecked and says so', async () => {
    const draft = 'Prices rose in Q3. [[cite:s1]] Prices rose in Q3 again. [[cite:s1]]';
    const outcome = await verifyDraft({
      draft,
      userId: 'u1',
      maxClaims: 1,
      strict: false,
      getSnapshotsByIds,
      reader,
      verifier: keywordVerifier,
    });
    expect(outcome.citations.map((c) => c.state)).toEqual(['supported', 'unsupported']);
    expect(outcome.notes).toContain('1 citation was not checked');
  });

  it('requires every citation of a sentence to hold in strict mode', async () => {
    const draft = 'Prices rose in Q3. [[cite:s1]][[cite:s2]]';
    const lenient = await verifyDraft({
      draft,
      userId: 'u1',
      maxClaims: 10,
      strict: false,
      getSnapshotsByIds,
      reader,
      verifier: keywordVerifier,
    });
    const strict = await verifyDraft({
      draft,
      userId: 'u1',
      maxClaims: 10,
      strict: true,
      getSnapshotsByIds,
      reader,
      verifier: keywordVerifier,
    });
    expect(lenient.sentenceStates).toEqual(['supported']);
    expect(strict.sentenceStates).toEqual(['unsupported']);
  });

  it('records the scope check against the brief', async () => {
    const outcome = await verifyDraft({
      draft: 'An off-topic aside. [[cite:s1]]',
      brief: 'Prices in Q3',
      userId: 'u1',
      maxClaims: 10,
      strict: false,
      getSnapshotsByIds,
      reader,
      verifier: keywordVerifier,
    });
    expect(outcome.summary.scopeNotes).toBe('Report drifts.');
  });

  it('treats a verifier failure as unverified rather than supported', async () => {
    const failing: ClaimVerifier = {
      verifyClaim: async () => {
        throw new Error('gateway down');
      },
      checkScope: async () => null,
    };
    const outcome = await verifyDraft({
      draft: 'Prices rose in Q3. [[cite:s1]]',
      userId: 'u1',
      maxClaims: 10,
      strict: false,
      getSnapshotsByIds,
      reader,
      verifier: failing,
    });
    expect(outcome.citations[0].state).toBe('unsupported');
    expect(outcome.notes).toContain('could not be checked');
  });
});
