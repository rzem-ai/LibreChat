import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SUITES_DIR = path.resolve(here, '..', '..', 'manual testing suites');

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const DATE_RE = new RegExp(`^\\d{2} (${MONTHS}) \\d{4}$`);
const ID_RE = /^([A-Z]+)-\d{3,}$/;

export function loadSuites(dir = SUITES_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'suite.schema.json')
    .sort()
    .map((name) => ({ file: name, ...JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) }));
}

const isLink = (value) =>
  value === null ||
  (typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.url === 'string' &&
    value.url.startsWith('https://'));

function validateStep(step, where) {
  if (typeof step?.action !== 'string' || !step.action.trim()) {
    return [`${where}: step needs a non-empty "action"`];
  }
  const valid =
    Array.isArray(step.acceptanceCriteria) &&
    step.acceptanceCriteria.every((c) => typeof c === 'string' && c.trim());
  return valid ? [] : [`${where}: "acceptanceCriteria" must be an array of non-empty strings`];
}

function validateTest(test, suite, seen) {
  const where = `${suite.file} ${test?.id ?? '<no id>'}`;
  const idMatch = ID_RE.exec(test?.id ?? '');
  const duplicate = seen.has(test?.id) ? [`${where}: duplicate id (also in ${seen.get(test.id)})`] : [];
  seen.set(test?.id, suite.file);
  const steps = Array.isArray(test?.steps) ? test.steps : [];
  return [
    ...duplicate,
    ...(idMatch ? [] : [`${where}: id must look like PREFIX-001`]),
    ...(idMatch && idMatch[1] !== suite.idPrefix ? [`${where}: id prefix must be ${suite.idPrefix}`] : []),
    ...(typeof test?.goal === 'string' && test.goal.trim() ? [] : [`${where}: missing "goal"`]),
    ...(DATE_RE.test(test?.dateUpdated ?? '') ? [] : [`${where}: "dateUpdated" must be DD Mon YYYY`]),
    ...(isLink(test?.author) ? [] : [`${where}: "author" must be null or { name, url }`]),
    ...(isLink(test?.lastPr) ? [] : [`${where}: "lastPr" must be null or { name, url }`]),
    ...(steps.length ? [] : [`${where}: needs at least one step`]),
    ...steps.flatMap((step, i) => validateStep(step, `${where} step ${i + 1}`)),
    ...(steps.some((s) => s?.acceptanceCriteria?.length) ? [] : [`${where}: needs at least one acceptance criterion`]),
  ];
}

export function validateSuites(suites) {
  const seen = new Map();
  return suites.flatMap((suite) => [
    ...(typeof suite.suite === 'string' && suite.suite ? [] : [`${suite.file}: missing "suite"`]),
    ...(/^[A-Z]+$/.test(suite.idPrefix ?? '') ? [] : [`${suite.file}: "idPrefix" must be uppercase letters`]),
    ...(Array.isArray(suite.tests) && suite.tests.length ? [] : [`${suite.file}: needs at least one test`]),
    ...(suite.tests ?? []).flatMap((test) => validateTest(test, suite, seen)),
  ]);
}
