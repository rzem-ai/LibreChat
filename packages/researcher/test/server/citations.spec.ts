import {
  citationMarker,
  parseCitedSentences,
  countUncitedSentences,
  renderCitationMarkers,
} from '../../src/server/citations';

describe('citation parsing', () => {
  it('attaches trailing markers to the sentence they follow', () => {
    const draft =
      'Prices rose 4% in Q3. [[cite:snap_a]] Analysts expect a slowdown [[cite:snap_b#Outlook 2.1]]. No citation here.';
    const sentences = parseCitedSentences(draft);
    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('Prices rose 4% in Q3.');
    expect(sentences[0].citations).toEqual([{ snapshotId: 'snap_a' }]);
    expect(sentences[1].text).toBe('Analysts expect a slowdown.');
    expect(sentences[1].citations).toEqual([{ snapshotId: 'snap_b', locator: 'Outlook 2.1' }]);
  });

  it('keeps a locator containing full stops intact', () => {
    const [sentence] = parseCitedSentences('See the clause. [[cite:doc_1#section 4.2.1]]');
    expect(sentence.citations[0]).toEqual({ snapshotId: 'doc_1', locator: 'section 4.2.1' });
  });

  it('returns spans that cover the sentence and its markers in the source', () => {
    const draft = '# Title\n\nA fact. [[cite:s1]][[cite:s2]]\n- Bullet fact [[cite:s3]]';
    const sentences = parseCitedSentences(draft);
    expect(sentences.map((s) => draft.slice(s.start, s.end))).toEqual([
      'A fact. [[cite:s1]][[cite:s2]]',
      'Bullet fact [[cite:s3]]',
    ]);
    expect(sentences[0].citations.map((c) => c.snapshotId)).toEqual(['s1', 's2']);
  });

  it('does not end a sentence at a decimal point', () => {
    const draft =
      'Roleplay attacks succeeded 89.6% of the time, against 76.2% for encoding. [[cite:s1]]';
    const sentences = parseCitedSentences(draft);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].start).toBe(0);
    expect(sentences[0].text).toBe(
      'Roleplay attacks succeeded 89.6% of the time, against 76.2% for encoding.',
    );
  });

  it('starts a sentence that opens with a number at the number, not after it', () => {
    const draft = '1. First item [[cite:s1]]\n2026 saw the most incidents yet. [[cite:s2]]';
    const sentences = parseCitedSentences(draft);
    expect(sentences.map((s) => draft.slice(s.start, s.end))).toEqual([
      'First item [[cite:s1]]',
      '2026 saw the most incidents yet. [[cite:s2]]',
    ]);
  });

  it('only treats real snapshot id characters as a marker', () => {
    expect(parseCitedSentences('Fact. [[cite:<img/src=x>]]')).toEqual([]);
    expect(parseCitedSentences('Fact. [[cite:a:b]]')).toEqual([]);
    expect(parseCitedSentences('Fact. [[cite:snap_A-b_9]]')[0].citations).toEqual([
      { snapshotId: 'snap_A-b_9' },
    ]);
  });

  it('builds and renders markers as numbered references in first-seen order', () => {
    expect(citationMarker('s9', 'p.3')).toBe('[[cite:s9#p.3]]');
    const { text, order } = renderCitationMarkers('A. [[cite:s2]] B. [[cite:s1#x]] C. [[cite:s2]]');
    expect(text).toBe('A. [1] B. [2] C. [1]');
    expect(order).toEqual(['s2', 's1']);
  });
});

describe('countUncitedSentences', () => {
  it('counts prose sentences that carry no citation', () => {
    const draft = [
      '# Daily digest',
      '',
      'Widgets grew four percent this quarter. [[cite:s1]] Analysts expect the trend to continue for years.',
      'The board met on Tuesday to discuss pricing.',
      '',
      '| Item | Note |',
      '| --- | --- |',
      '| Widgets are growing fast | yes |',
      '',
      '## Left out',
      '',
      'The draft did not include this section.',
      '',
      '- Kept two items.',
    ].join('\n');
    expect(countUncitedSentences(draft)).toBe(2);
  });

  it('is zero when every sentence is cited', () => {
    expect(countUncitedSentences('Prices rose in Q3 this year. [[cite:s1]]')).toBe(0);
  });
});
