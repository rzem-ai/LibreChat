import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LIBRECHAT_YAML = path.resolve(here, '..', '..', 'librechat.yaml');

export const PLACEHOLDERS = ['MODEL_NAME', 'PROVIDER_NAME'];
export const WHERE_KEYS = ['name', 'group', 'endpoint', 'webSearch'];
const PLACEHOLDER_RE = /\{\{([A-Z_]+)\}\}/g;

export function loadModelSpecs(file = LIBRECHAT_YAML) {
  const config = yaml.load(fs.readFileSync(file, 'utf8'));
  return (config?.modelSpecs?.list ?? []).map((spec) => ({
    name: spec.name,
    label: spec.label,
    group: spec.group,
    endpoint: spec.preset?.endpoint,
    webSearch: spec.details?.supports?.webSearch === true,
  }));
}

const asList = (value) => (Array.isArray(value) ? value : [value]);

export function matchesWhere(spec, where = {}) {
  return Object.entries(where).every(([key, expected]) => asList(expected).includes(spec[key]));
}

export function placeholdersIn(test) {
  const text = JSON.stringify([test.goal, test.steps]);
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

const fill = (text, spec) =>
  text.replaceAll('{{MODEL_NAME}}', spec.label).replaceAll('{{PROVIDER_NAME}}', spec.group);

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The `perModel` / `perProvider` setting of a test, with the unit it repeats over. */
export function repeatConfig(test) {
  if (test.perModel) return { unit: 'model', where: test.perModel === true ? {} : test.perModel.where };
  if (test.perProvider) return { unit: 'provider', where: test.perProvider === true ? {} : test.perProvider.where };
  return undefined;
}

function instantiate(test, spec, suffix) {
  const { perModel, perProvider, ...rest } = test;
  return {
    ...rest,
    id: `${test.id} / ${suffix}`,
    goal: fill(test.goal, spec),
    steps: test.steps.map((step) => ({
      action: fill(step.action, spec),
      acceptanceCriteria: step.acceptanceCriteria.map((c) => fill(c, spec)),
    })),
  };
}

const firstPerProvider = (specs) => [...new Map(specs.map((spec) => [spec.group, spec])).values()];

function expandTest(test, specs) {
  const config = repeatConfig(test);
  if (!config) return [test];
  const matching = specs.filter((spec) => matchesWhere(spec, config.where));
  return config.unit === 'model'
    ? matching.map((spec) => instantiate(test, spec, spec.name))
    : firstPerProvider(matching).map((spec) => instantiate(test, spec, slug(spec.group)));
}

/** Replaces each `perModel` / `perProvider` test with one test per matching model spec / provider group, in spec order. */
export function expandPerModel(suites, specs) {
  return suites.map((suite) => ({ ...suite, tests: suite.tests.flatMap((test) => expandTest(test, specs)) }));
}

/** Ids of repeated tests whose `where` filter matches no model spec, so they would silently vanish from the sheet. */
export function unmatchedPerModel(suites, specs) {
  return suites
    .flatMap((suite) => suite.tests)
    .filter((test) => {
      const config = repeatConfig(test);
      return config && !specs.some((spec) => matchesWhere(spec, config.where));
    })
    .map((test) => test.id);
}
