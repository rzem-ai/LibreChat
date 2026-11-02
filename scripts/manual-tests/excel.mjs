import ExcelJS from 'exceljs';

export const TESTER_COUNT = 20;
export const TESTER_RESULTS = ['not started', 'skipped', 'minor bug', 'major bug', 'pass'];
export const OVERALL_RESULTS = ['insufficient testers', 'minor bug', 'major bug', 'pass'];

const FILLS = {
  white: 'FFFFFFFF',
  grey: 'FFD9D9D9',
  green: 'FFC6EFCE',
  amber: 'FFFFEB9C',
  red: 'FFFFC7CE',
};
const TESTER_COLOURS = {
  skipped: FILLS.grey,
  'not started': FILLS.white,
  pass: FILLS.green,
  'minor bug': FILLS.amber,
  'major bug': FILLS.red,
};
const OVERALL_COLOURS = {
  'insufficient testers': FILLS.white,
  pass: FILLS.green,
  'minor bug': FILLS.amber,
  'major bug': FILLS.red,
};

const COLUMNS = [
  { header: 'Test Suite', width: 26 },
  { header: 'Test ID', width: 14 },
  { header: 'Goal', width: 40 },
  { header: 'Testing Steps', width: 60 },
  { header: 'Date Updated', width: 14 },
  { header: 'Author', width: 18 },
  { header: 'Last PR', width: 12 },
  { header: 'Comments', width: 40 },
  { header: 'Overall Result', width: 20 },
];

/** Excel formula giving a test's overall result from its tester cells. */
export function overallFormula(range) {
  return (
    `IF(COUNTIF(${range},"major bug")>0,"major bug",` +
    `IF(COUNTIF(${range},"minor bug")>0,"minor bug",` +
    `IF(COUNTIF(${range},"pass")>=2,"pass","insufficient testers")))`
  );
}

export function formatSteps(steps) {
  return steps
    .map((step, i) =>
      [`${i + 1}. ${step.action}`, ...step.acceptanceCriteria.map((c) => `   ✔ ${c}`)].join('\n'),
    )
    .join('\n');
}

const link = (value) =>
  value ? { text: value.name, hyperlink: value.url } : '';

const colourRules = (colours) =>
  Object.entries(colours).map(([value, argb]) => ({
    type: 'cellIs',
    operator: 'equal',
    formulae: [`"${value}"`],
    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } },
  }));

const listValidation = (values) => ({
  type: 'list',
  allowBlank: false,
  showErrorMessage: true,
  errorTitle: 'Invalid value',
  error: `Choose one of: ${values.join(', ')}`,
  formulae: [`"${values.join(',')}"`],
});

export function buildWorkbook(suites) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Manual Tests', { views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] });

  const testerHeaders = Array.from({ length: TESTER_COUNT }, (_, i) => `Tester ${i + 1}`);
  sheet.columns = [
    ...COLUMNS,
    ...testerHeaders.map((header) => ({ header, width: 14 })),
  ];

  const firstTester = COLUMNS.length + 1;
  const lastTester = COLUMNS.length + TESTER_COUNT;
  const rows = suites.flatMap((suite) => suite.tests.map((test) => ({ suite, test })));

  rows.forEach(({ suite, test }, index) => {
    const rowNumber = index + 2;
    const range = `${sheet.getCell(rowNumber, firstTester).address}:${sheet.getCell(rowNumber, lastTester).address}`;
    const row = sheet.getRow(rowNumber);
    row.values = [
      suite.suite,
      test.id,
      test.goal,
      formatSteps(test.steps),
      test.dateUpdated,
      link(test.author),
      link(test.lastPr),
      '',
      { formula: overallFormula(range), result: 'insufficient testers' },
      ...Array.from({ length: TESTER_COUNT }, () => 'not started'),
    ];
    row.alignment = { vertical: 'top', wrapText: true };
    sheet.getCell(rowNumber, 9).dataValidation = listValidation(OVERALL_RESULTS);
    for (let col = firstTester; col <= lastTester; col++) {
      sheet.getCell(rowNumber, col).dataValidation = listValidation(TESTER_RESULTS);
    }
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF26890D' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 1), column: lastTester } };

  const lastRow = rows.length + 1;
  if (rows.length) {
    sheet.addConditionalFormatting({ ref: `I2:I${lastRow}`, rules: colourRules(OVERALL_COLOURS) });
    const testerRef = `${sheet.getCell(2, firstTester).address}:${sheet.getCell(lastRow, lastTester).address}`;
    sheet.addConditionalFormatting({ ref: testerRef, rules: colourRules(TESTER_COLOURS) });
  }

  return workbook;
}
