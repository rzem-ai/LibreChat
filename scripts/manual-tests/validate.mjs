import { loadSuites, validateSuites } from './suites.mjs';

const suites = loadSuites();
const errors = validateSuites(suites);
const total = suites.reduce((n, s) => n + s.tests.length, 0);

if (errors.length) {
  console.error(errors.map((e) => `  - ${e}`).join('\n'));
  console.error(`\n${errors.length} problem(s) in manual testing suites`);
  process.exit(1);
}
console.log(`manual testing suites OK: ${total} tests across ${suites.length} suites`);
