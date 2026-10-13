import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { tierFromRange, run } from './deloitte.sync-model-metadata.mjs';

test('tierFromRange', async (t) => {
  await t.test('returns a neutral tier when min equals max', () => {
    assert.equal(tierFromRange(5, 5, 5, false), 3);
  });

  await t.test('maps ascending ranges to 1-5, worst to best', () => {
    assert.equal(tierFromRange(0, 0, 100, false), 1);
    assert.equal(tierFromRange(100, 0, 100, false), 5);
    assert.equal(tierFromRange(50, 0, 100, false), 3);
  });

  await t.test('inverts for lower-is-better metrics', () => {
    assert.equal(tierFromRange(0, 0, 100, true), 5);
    assert.equal(tierFromRange(100, 0, 100, true), 1);
  });
});

test('run()', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'deloitte.sync-model-metadata-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const yamlPath = join(scratch, 'librechat.yaml');

  const fixture = `# top-level comment preserved across the round trip
modelSpecs:
  promptPrefix: &sharedPrompt |
    shared system prompt
  list:
    - name: 'spec-a'
      label: 'Spec A'
      # per-spec comment preserved
      artificialAnalysisBenchmarkModelName: 'model-a'
      preset:
        endpoint: 'anthropic'
        model: 'model-a'
        promptPrefix: *sharedPrompt

    - name: 'spec-b-unmatched'
      label: 'Spec B'
      artificialAnalysisBenchmarkModelName: 'model-b-not-in-catalog'
      preset:
        endpoint: 'anthropic'
        model: 'model-b'
        promptPrefix: *sharedPrompt

    - name: 'spec-c-no-benchmark'
      label: 'Spec C'
      preset:
        endpoint: 'anthropic'
        model: 'model-c'
        promptPrefix: *sharedPrompt

    - name: 'spec-d'
      label: 'Spec D'
      artificialAnalysisBenchmarkModelName: 'model-d'
      preset:
        endpoint: 'anthropic'
        model: 'model-d'
        promptPrefix: *sharedPrompt
`;
  writeFileSync(yamlPath, fixture);

  const catalog = {
    data: [
      {
        slug: 'model-a',
        evaluations: { artificial_analysis_intelligence_index: 20 },
        performance: { median_end_to_end_response_time_seconds: 10 },
      },
      {
        slug: 'model-d',
        evaluations: { artificial_analysis_intelligence_index: 80 },
        performance: { median_end_to_end_response_time_seconds: 2 },
      },
    ],
  };
  const fetchImpl = async () => ({ ok: true, json: async () => catalog });

  const now = new Date(2026, 10, 31); // 31 October 2026
  const { updated, warnings } = await run({ yamlPath, apiKey: 'test-key', fetchImpl, now });

  await t.test('updates only matched specs, with the expected relative tiers', () => {
    assert.deepEqual(
      updated.sort((a, b) => a.index - b.index),
      [
        { index: 0, speed: 1, intelligence: 1 },
        { index: 3, speed: 5, intelligence: 5 },
      ],
    );
  });

  await t.test('warns on a benchmark name with no catalog match', () => {
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /model-b-not-in-catalog/);
  });

  const output = readFileSync(yamlPath, 'utf8');
  const specBlock = (name) => output.match(new RegExp(`${name}[\\s\\S]*?(?=\\n {4}- name:|$)`))[0];

  await t.test('leaves unmatched and opted-out specs without a details block', () => {
    assert.doesNotMatch(specBlock('spec-b-unmatched'), /details:/);
    assert.doesNotMatch(specBlock('spec-c-no-benchmark'), /details:/);
  });

  await t.test('tags each updated speed/intelligence line with a dated sync comment', () => {
    const comment = '# updated by deloitte.sync-model-metadata workflow on 31 October 2026';
    const specA = specBlock('spec-a');
    assert.match(specA, new RegExp(`speed: 1 ${comment}`));
    assert.match(specA, new RegExp(`intelligence: 1 ${comment}`));
    const specD = specBlock('spec-d');
    assert.match(specD, new RegExp(`speed: 5 ${comment}`));
    assert.match(specD, new RegExp(`intelligence: 5 ${comment}`));
  });

  await t.test('preserves comments and the anchor/alias pair', () => {
    assert.match(output, /# top-level comment preserved across the round trip/);
    assert.match(output, /# per-spec comment preserved/);
    assert.match(output, /&sharedPrompt/);
    assert.match(output, /\*sharedPrompt/);
  });
});
