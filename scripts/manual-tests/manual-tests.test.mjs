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
