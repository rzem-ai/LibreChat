const fs = require('fs');
const path = require('path');
const { logger } = require('@librechat/data-schemas');

const DEFAULT_PRICING_PATH = '/app/llm-pricing.yaml';
const LOCAL_CONFIGMAP_PATH = path.resolve(
  process.cwd(),
  'charts/config/llm-cost-analyzer-configmap.yaml',
);

let cachedPricing;

function readFirstExisting(paths) {
  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

function extractPricingYaml(contents) {
  if (!contents.includes('pricing.yaml: |')) {
    return contents;
  }

  const lines = contents.split('\n');
  const startIndex = lines.findIndex((line) => line.includes('pricing.yaml: |'));
  if (startIndex === -1) {
    return contents;
  }

  const pricingLines = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line.trim().startsWith('{{-')) {
      break;
    }
    if (line.trim() && !line.startsWith('    ')) {
      break;
    }
    pricingLines.push(line.startsWith('    ') ? line.slice(4) : line);
  }

  return pricingLines.join('\n');
}

function parsePricingYaml(pricingYaml) {
  const pricing = {};
  let provider;
  let model;

  for (const line of pricingYaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'providers:' || trimmed === 'models:') {
      continue;
    }

    const indentation = line.search(/\S/);
    const sectionMatch = trimmed.match(/^([^:]+):$/);
    if (sectionMatch) {
      if (indentation === 2) {
        provider = sectionMatch[1];
        model = undefined;
      } else if (provider) {
        model = sectionMatch[1];
        pricing[model] = { provider };
      }
      continue;
    }

    if (!model) {
      continue;
    }

    const valueMatch = trimmed.match(/^(input_per_1m|output_per_1m):\s*([0-9.]+)$/);
    if (!valueMatch) {
      continue;
    }
    const value = Number(valueMatch[2]);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (valueMatch[1] === 'input_per_1m') {
      pricing[model].inputPer1M = value;
    } else {
      pricing[model].outputPer1M = value;
    }
  }

  for (const [modelName, modelPricing] of Object.entries(pricing)) {
    if (!Number.isFinite(modelPricing.inputPer1M) || !Number.isFinite(modelPricing.outputPer1M)) {
      delete pricing[modelName];
    }
  }

  return pricing;
}

function getModelPricing() {
  if (cachedPricing) {
    return cachedPricing;
  }

  try {
    const rawContents = readFirstExisting([
      process.env.LLM_PRICING_CONFIG_PATH,
      DEFAULT_PRICING_PATH,
      LOCAL_CONFIGMAP_PATH,
    ]);
    if (!rawContents) {
      cachedPricing = {};
      return cachedPricing;
    }

    const pricingYaml = extractPricingYaml(rawContents);
    cachedPricing = parsePricingYaml(pricingYaml);
    return cachedPricing;
  } catch (error) {
    logger.warn(`[config] Failed to load model pricing: ${error.message}`);
    cachedPricing = {};
    return cachedPricing;
  }
}

function clearModelPricingCache() {
  cachedPricing = undefined;
}

module.exports = { getModelPricing, clearModelPricingCache };
