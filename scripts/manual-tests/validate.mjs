import { loadModelSpecs, unmatchedPerModel } from './models.mjs';
import { loadSuites, validateSuites } from './suites.mjs';

const suites = loadSuites();
const errors = validateSuites(suites);

if (errors.length) {
  console.error(errors.map((e) => `  - ${e}`).join('\n'));
  console.error(`\n${errors.length} problem(s) in manual testing suites`);
  process.exit(1);
}
const total = suites.reduce((n, s) => n + s.tests.length, 0);
const unmatched = unmatchedPerModel(suites, loadModelSpecs());
if (unmatched.length) {
  console.warn(`WARNING: no model in librechat.yaml matches ${unmatched.join(', ')}; these tests would not appear in the sheet.`);
}
console.log(`manual testing suites OK: ${total} tests across ${suites.length} suites`);
