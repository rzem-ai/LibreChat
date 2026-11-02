import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import {
  TESTER_COUNT,
  TESTER_RESULTS,
  OVERALL_RESULTS,
  buildWorkbook,
  formatSteps,
  overallFormula,
} from './excel.mjs';
import { expandPerModel, loadModelSpecs, matchesWhere, unmatchedPerModel } from './models.mjs';
import { loadSuites, validateSuites } from './suites.mjs';

const link = (name, url) => ({ name, url });
const sample = [
  {
    file: 'a.json',
    suite: 'Alpha',
    idPrefix: 'ALP',
    tests: [
      {
        id: 'ALP-001',
        goal: 'First',
        dateUpdated: '02 Nov 2026',
        author: link('someone', 'https://github.com/someone'),
        lastPr: link('#1', 'https://github.com/o/r/pull/1'),
        steps: [{ action: 'Do a thing', acceptanceCriteria: ['It works'] }],
      },
      {
        id: 'ALP-002',
        goal: 'Second',
        dateUpdated: '03 Nov 2026',
        author: null,
        lastPr: null,
        steps: [{ action: 'Do another', acceptanceCriteria: ['It also works'] }],
      },
    ],
  },
];

async function roundTrip(suites) {
  const buffer = await buildWorkbook(suites).xlsx.writeBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet('Manual Tests');
}

test('the committed suites are valid', () => {
  assert.deepEqual(validateSuites(loadSuites()), []);
});

test('validation rejects bad ids, dates, duplicates and missing criteria', () => {
  const bad = structuredClone(sample);
  bad[0].tests[0].dateUpdated = '2026-11-02';
  bad[0].tests[1].id = 'ALP-001';
  bad[0].tests[1].steps[0].acceptanceCriteria = [];
  const errors = validateSuites(bad).join('\n');
  assert.match(errors, /DD Mon YYYY/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /at least one acceptance criterion/);
});

test('sheet has the required columns in order', async () => {
  const sheet = await roundTrip(sample);
  const headers = sheet.getRow(1).values.slice(1);
  assert.deepEqual(headers.slice(0, 9), [
    'Test Suite', 'Test ID', 'Goal', 'Testing Steps', 'Date Updated', 'Author', 'Last PR', 'Comments', 'Overall Result',
  ]);
  assert.equal(headers.length, 9 + TESTER_COUNT);
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell('D2').value, formatSteps(sample[0].tests[0].steps));
  assert.equal(sheet.getCell('H2').value ?? '', '');
  assert.equal(sheet.getCell('E2').value, '02 Nov 2026');
});

test('overall result and every tester cell carry data validation', async () => {
  const sheet = await roundTrip(sample);
  assert.deepEqual(sheet.getCell('I2').dataValidation.formulae, [`"${OVERALL_RESULTS.join(',')}"`]);
  for (let col = 10; col < 10 + TESTER_COUNT; col++) {
    for (const row of [2, 3]) {
      const validation = sheet.getCell(row, col).dataValidation;
      assert.equal(validation.type, 'list');
      assert.deepEqual(validation.formulae, [`"${TESTER_RESULTS.join(',')}"`]);
    }
  }
});

test('conditional formatting covers the overall and tester columns', async () => {
  const sheet = await roundTrip(sample);
  const rules = sheet.conditionalFormattings.map((cf) => ({
    ref: cf.ref,
    values: cf.rules.map((r) => r.formulae[0]),
  }));
  const overall = rules.find((r) => r.ref === 'I2:I3');
  const testers = rules.find((r) => r.ref === 'J2:AC3');
  assert.deepEqual(overall.values.sort(), OVERALL_RESULTS.map((v) => `"${v}"`).sort());
  assert.deepEqual(testers.values.sort(), TESTER_RESULTS.map((v) => `"${v}"`).sort());
});

test('overall result formula references the row tester range', async () => {
  const sheet = await roundTrip(sample);
  assert.equal(sheet.getCell('I2').value.formula, overallFormula('J2:AC2'));
  assert.equal(sheet.getCell('I3').value.formula, overallFormula('J3:AC3'));
});

const specs = [
  { name: 'a-one', label: 'One', group: 'Alpha', endpoint: 'x', webSearch: true },
  { name: 'a-two', label: 'Two', group: 'Alpha', endpoint: 'x', webSearch: false },
  { name: 'b-three', label: 'Three', group: 'Beta', endpoint: 'y', webSearch: true },
];

function perModelSuite(perModel, goal = 'Confirm that {{MODEL_NAME}} ({{PROVIDER_NAME}}) works') {
  const suite = structuredClone(sample);
  suite[0].tests = [
    {
      ...suite[0].tests[0],
      goal,
      perModel,
      steps: [{ action: 'Select {{MODEL_NAME}}', acceptanceCriteria: ['{{PROVIDER_NAME}} replies'] }],
    },
  ];
  return suite;
}

test('perModel true expands one test per model spec with placeholders filled', () => {
  const [suite] = expandPerModel(perModelSuite(true), specs);
  assert.deepEqual(suite.tests.map((t) => t.id), ['ALP-001 / a-one', 'ALP-001 / a-two', 'ALP-001 / b-three']);
  assert.equal(suite.tests[2].goal, 'Confirm that Three (Beta) works');
  assert.equal(suite.tests[2].steps[0].action, 'Select Three');
  assert.equal(suite.tests[2].steps[0].acceptanceCriteria[0], 'Beta replies');
  assert.equal('perModel' in suite.tests[0], false);
});

test('perModel where restricts by group, name and webSearch', () => {
  const ids = (where) => expandPerModel(perModelSuite({ where }), specs)[0].tests.map((t) => t.id);
  assert.deepEqual(ids({ group: 'Beta' }), ['ALP-001 / b-three']);
  assert.deepEqual(ids({ name: ['a-one', 'b-three'] }), ['ALP-001 / a-one', 'ALP-001 / b-three']);
  assert.deepEqual(ids({ webSearch: true }), ['ALP-001 / a-one', 'ALP-001 / b-three']);
  assert.equal(matchesWhere(specs[0], {}), true);
});

test('validation enforces placeholders and perModel together', () => {
  assert.deepEqual(validateSuites(perModelSuite(true)), []);
  const withoutFlag = perModelSuite(true);
  delete withoutFlag[0].tests[0].perModel;
  assert.match(validateSuites(withoutFlag).join('\n'), /placeholders require "perModel"/);
  const noPlaceholders = perModelSuite(true, 'Confirm that it works');
  noPlaceholders[0].tests[0].steps = [{ action: 'Do it', acceptanceCriteria: ['It works'] }];
  assert.match(validateSuites(noPlaceholders).join('\n'), /must use \{\{MODEL_NAME\}\}/);
  assert.match(validateSuites(perModelSuite({ where: { colour: 'red' } })).join('\n'), /perModel.where key "colour"/);
  assert.match(validateSuites(perModelSuite(true, 'Confirm {{NOPE}}')).join('\n'), /unknown placeholder/);
});

test('model specs load from librechat.yaml with the fields perModel filters use', () => {
  const loaded = loadModelSpecs();
  assert.ok(loaded.length > 0);
  assert.ok(loaded.every((s) => s.name && s.label && s.group && typeof s.webSearch === 'boolean'));
});

test('unmatchedPerModel reports tests whose filter matches no model', () => {
  assert.deepEqual(unmatchedPerModel(perModelSuite(true), specs), []);
  assert.deepEqual(unmatchedPerModel(perModelSuite({ where: { group: 'Nope' } }), specs), ['ALP-001']);
});

test('perProvider expands once per provider group and rejects {{MODEL_NAME}}', () => {
  const suite = perModelSuite(true, 'Confirm that {{PROVIDER_NAME}} works');
  suite[0].tests[0].perProvider = true;
  delete suite[0].tests[0].perModel;
  suite[0].tests[0].steps = [{ action: 'Select any {{PROVIDER_NAME}} model', acceptanceCriteria: ['It works'] }];
  assert.deepEqual(validateSuites(suite), []);
  const [expanded] = expandPerModel(suite, specs);
  assert.deepEqual(expanded.tests.map((t) => t.id), ['ALP-001 / alpha', 'ALP-001 / beta']);
  assert.equal(expanded.tests[1].steps[0].action, 'Select any Beta model');
  assert.deepEqual(unmatchedPerModel(suite, specs), []);

  const withModel = structuredClone(suite);
  withModel[0].tests[0].goal = 'Confirm that {{MODEL_NAME}} works';
  assert.match(validateSuites(withModel).join('\n'), /perProvider tests cannot use \{\{MODEL_NAME\}\}/);

  const both = structuredClone(suite);
  both[0].tests[0].perModel = true;
  assert.match(validateSuites(both).join('\n'), /either "perModel" or "perProvider"/);
});

test('malformed suites return diagnostics instead of throwing', () => {
  for (const tests of [{}, null, undefined, 'nope']) {
    const suite = [{ file: 'bad.json', suite: 'Bad', idPrefix: 'BAD', tests }];
    assert.match(validateSuites(suite).join('\n'), /bad\.json: needs at least one test/);
  }
});
