import fs from 'node:fs';
import path from 'node:path';
import { buildWorkbook } from './excel.mjs';
import { expandPerModel, loadModelSpecs, unmatchedPerModel } from './models.mjs';
import { loadSuites, validateSuites } from './suites.mjs';

const DEFAULT_OUTPUT = path.resolve('manual-testing-session.xlsx');

async function main() {
  const output = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  const templates = loadSuites();
  const errors = validateSuites(templates);
  if (errors.length) {
    console.error(errors.map((e) => `  - ${e}`).join('\n'));
    console.error('\nFix the suites (npm run manual-tests:validate) before generating the sheet.');
    process.exit(1);
  }
  const specs = loadModelSpecs();
  const unmatched = unmatchedPerModel(templates, specs);
  if (unmatched.length) {
    console.warn(`WARNING: no model in librechat.yaml matches ${unmatched.join(', ')}; these tests are not in the sheet.`);
  }
  const suites = expandPerModel(templates, specs);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await buildWorkbook(suites).xlsx.writeFile(output);
  const total = suites.reduce((n, s) => n + s.tests.length, 0);
  console.log(`Wrote ${total} tests from ${suites.length} suites to ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
