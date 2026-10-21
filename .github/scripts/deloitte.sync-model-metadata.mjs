#!/usr/bin/env node
// Populates modelSpecs.list[].details.speed/intelligence in librechat.yaml from the
// Artificial Analysis API, keyed off each spec's artificialAnalysisBenchmarkModelName (the
// medium-effort variant of that slug is used when the catalog has one).
// Edits via the `yaml` package's Document API (not js-yaml) so comments and the
// &deloitteSystemPrompt anchor/alias survive the round trip.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

const AA_MODELS_URL = 'https://artificialanalysis.ai/api/v2/language/models';
const AA_MODELS_FREE_URL = `${AA_MODELS_URL}/free`;
const MAX_PAGES = 10;
const PREFERRED_EFFORT = 'medium';

/**
 * Maps `value` into a 1-5 tier by position within the observed [min, max] range,
 * split into 5 equal buckets — no fixed breakpoints. `invert` flips the direction
 * for metrics where lower is better (response time).
 */
export function tierFromRange(value, min, max, invert) {
  if (max === min) {
    return 3;
  }
  const ratio = (value - min) / (max - min);
  const normalized = invert ? 1 - ratio : ratio;
  return Math.min(Math.max(Math.ceil(normalized * 5), 1), 5);
}

const toFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function fetchPage(baseUrl, page, apiKey, fetchImpl) {
  return fetchImpl(`${baseUrl}?page=${page}`, { headers: { 'x-api-key': apiKey } });
}

async function fetchCatalog(apiKey, fetchImpl) {
  let baseUrl = AA_MODELS_URL;
  let response = await fetchPage(baseUrl, 1, apiKey, fetchImpl);
  if (response.status === 403) {
    // Pro-only endpoint rejected this key — fall back to the free-tier catalog, which
    // still carries both evaluations.artificial_analysis_intelligence_index and
    // performance.median_end_to_end_response_time_seconds, just for a smaller model set.
    baseUrl = AA_MODELS_FREE_URL;
    response = await fetchPage(baseUrl, 1, apiKey, fetchImpl);
  }

  const catalog = new Map();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (!response.ok) {
      throw new Error(
        `Artificial Analysis API request failed: ${response.status} ${response.statusText}`,
      );
    }
    const body = await response.json();
    for (const model of body.data ?? []) {
      if (typeof model.slug !== 'string' || !model.slug) {
        continue;
      }
      catalog.set(model.slug, {
        intelligenceIndex: toFiniteNumber(model.evaluations?.artificial_analysis_intelligence_index),
        medianResponseSeconds: toFiniteNumber(
          model.performance?.median_end_to_end_response_time_seconds,
        ),
      });
    }
    if (!body.pagination?.has_more) {
      break;
    }
    response = await fetchPage(baseUrl, page + 1, apiKey, fetchImpl);
  }
  return catalog;
}

/**
 * Artificial Analysis lists reasoning models once per effort level (`<slug>-low`, `-medium`,
 * `-high`, ...) with the bare slug meaning max effort. Prefers the medium-effort entry when one
 * exists with usable metrics, and otherwise falls back to the slug exactly as configured.
 */
export function resolveCatalogEntry(catalog, benchmarkName) {
  const isUsable = (entry) =>
    entry?.intelligenceIndex != null && entry?.medianResponseSeconds != null;
  const preferredSlug = `${benchmarkName}-${PREFERRED_EFFORT}`;
  const preferred = catalog.get(preferredSlug);
  if (isUsable(preferred)) {
    return { slug: preferredSlug, entry: preferred };
  }
  return { slug: benchmarkName, entry: catalog.get(benchmarkName) };
}

/** Formats `date` as e.g. "13 October 2026" for the trailing sync comment. */
function formatSyncDate(date) {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Sets `doc` at `path` to `value`, tagging the line with a dated sync comment. */
function setWithSyncComment(doc, path, value, comment) {
  const node = doc.createNode(value);
  node.comment = ` ${comment}`;
  doc.setIn(path, node);
}

/** Mutates `doc` in place; returns which spec indexes were updated/warned for logging. */
export function syncDocument(doc, catalog, now = new Date()) {
  const list = doc.getIn(['modelSpecs', 'list']);
  if (!list?.items) {
    return { updated: [], warnings: [] };
  }

  const candidates = list.items.map((_, index) => {
    const benchmarkName = doc.getIn([
      'modelSpecs',
      'list',
      index,
      'artificialAnalysisBenchmarkModelName',
    ]);
    return { index, benchmarkName };
  });

  const warnings = [];
  const matched = [];
  for (const { index, benchmarkName } of candidates) {
    if (benchmarkName == null) {
      continue; // Deliberate opt-out — no warning.
    }
    const { slug, entry } = resolveCatalogEntry(catalog, benchmarkName);
    if (!entry || entry.intelligenceIndex == null || entry.medianResponseSeconds == null) {
      warnings.push(
        `::warning::No Artificial Analysis catalog match for "${benchmarkName}" (modelSpecs.list[${index}]) — details left unchanged.`,
      );
      continue;
    }
    matched.push({ index, slug, ...entry });
  }

  if (!matched.length) {
    return { updated: [], warnings };
  }

  const intelligenceValues = matched.map((m) => m.intelligenceIndex);
  const speedValues = matched.map((m) => m.medianResponseSeconds);
  const intelligenceMin = Math.min(...intelligenceValues);
  const intelligenceMax = Math.max(...intelligenceValues);
  const speedMin = Math.min(...speedValues);
  const speedMax = Math.max(...speedValues);

  const syncComment = `updated by deloitte.sync-model-metadata workflow on ${formatSyncDate(now)}`;
  const updated = matched.map(({ index, slug, intelligenceIndex, medianResponseSeconds }) => {
    const speed = tierFromRange(medianResponseSeconds, speedMin, speedMax, true);
    const intelligence = tierFromRange(intelligenceIndex, intelligenceMin, intelligenceMax, false);
    setWithSyncComment(doc, ['modelSpecs', 'list', index, 'details', 'speed'], speed, syncComment);
    setWithSyncComment(
      doc,
      ['modelSpecs', 'list', index, 'details', 'intelligence'],
      intelligence,
      syncComment,
    );
    return { index, slug, speed, intelligence, intelligenceIndex, medianResponseSeconds };
  });

  return { updated, warnings };
}

/**
 * Confines the rewrite to the `modelSpecs.list` span: everything before and after it is kept
 * byte-identical to `source`. `doc.toString()` re-serializes the whole document and can
 * otherwise introduce unrelated formatting changes (flow-array spacing, trailing commas,
 * comment normalization) outside the nodes this script actually edits. Falls back to the full
 * rewrite if the untouched boundaries don't round-trip exactly, rather than risk corrupting
 * content it can't safely splice.
 */
export function patchListRegion(source, rewritten, listRange) {
  if (!listRange) {
    return rewritten;
  }
  const prefix = source.slice(0, listRange[0]);
  const suffix = source.slice(listRange[2] ?? listRange[1]);
  if (!rewritten.startsWith(prefix) || !rewritten.endsWith(suffix)) {
    return rewritten;
  }
  const middle = rewritten.slice(prefix.length, rewritten.length - suffix.length);
  return prefix + middle + suffix;
}

export async function run({ yamlPath, apiKey, fetchImpl = fetch, now = new Date() }) {
  const source = readFileSync(yamlPath, 'utf8');
  const doc = parseDocument(source);
  const listRange = doc.getIn(['modelSpecs', 'list'])?.range;
  const catalog = await fetchCatalog(apiKey, fetchImpl);
  const { updated, warnings } = syncDocument(doc, catalog, now);

  for (const warning of warnings) {
    console.log(warning);
  }
  if (updated.length) {
    writeFileSync(yamlPath, patchListRegion(source, doc.toString(), listRange));
  }
  console.log(`Updated ${updated.length} model spec(s), ${warnings.length} unmatched.`);
  return { updated, warnings };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href;
if (isMain) {
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (!apiKey) {
    console.error('::error::ARTIFICIAL_ANALYSIS_API_KEY is required');
    process.exit(1);
  }
  const yamlPath = process.env.LIBRECHAT_YAML_PATH ?? 'librechat.yaml';
  run({ yamlPath, apiKey }).catch((error) => {
    console.error(`::error::${error.stack ?? error.message}`);
    process.exit(1);
  });
}
