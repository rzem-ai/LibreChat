import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@librechat/data-schemas';
import type { TEndpointCostConfig, TModelPricing } from 'librechat-data-provider';

const DEFAULT_PRICING_PATH = '/app/endpoint-costs.yaml';
const LOCAL_CONFIGMAP_PATH = path.resolve(
  process.cwd(),
  'charts/config/endpoint-costs.yaml',
);
const DEFAULT_ENDPOINT_COST_CONFIG: TEndpointCostConfig = {
  REFERENCE_MODEL_ID: 'gpt-41',
  MULTIPLIER_ROUNDING_INCREMENT: 0.1,
  MIN_MULTIPLIER: 0.1,
};

let cachedEndpointCosts:
  | { modelPricing: TModelPricing; endpointCostConfig: TEndpointCostConfig }
  | undefined;

function readFirstExisting(paths: Array<string | undefined>): string | null {
  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

function extractPricingYaml(contents: string): string {
  if (!contents.includes('pricing.yaml: |')) {
    return contents;
  }

  const lines = contents.split('\n');
  const startIndex = lines.findIndex((line) => line.includes('pricing.yaml: |'));
  if (startIndex === -1) {
    return contents;
  }

  const pricingLines: string[] = [];
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

function parsePricingYaml(pricingYaml: string): TModelPricing {
  const pricing: TModelPricing = {};
  let provider: string | undefined;
  let model: string | undefined;

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
        pricing[model] = { inputPer1M: Number.NaN, outputPer1M: Number.NaN, provider };
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

function parseEndpointCostConfig(contents: string): TEndpointCostConfig {
  const config = { ...DEFAULT_ENDPOINT_COST_CONFIG };

  const referenceModelMatch = contents.match(/^\s*REFERENCE_MODEL_ID:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (referenceModelMatch?.[1]) {
    config.REFERENCE_MODEL_ID = referenceModelMatch[1].trim();
  }

  const roundingIncrementMatch = contents.match(
    /^\s*MULTIPLIER_ROUNDING_INCREMENT:\s*([0-9.]+)\s*$/m,
  );
  const roundingIncrement = Number(roundingIncrementMatch?.[1]);
  if (Number.isFinite(roundingIncrement) && roundingIncrement > 0) {
    config.MULTIPLIER_ROUNDING_INCREMENT = roundingIncrement;
  }

  const minMultiplierMatch = contents.match(/^\s*MIN_MULTIPLIER:\s*([0-9.]+)\s*$/m);
  const minMultiplier = Number(minMultiplierMatch?.[1]);
  if (Number.isFinite(minMultiplier) && minMultiplier > 0) {
    config.MIN_MULTIPLIER = minMultiplier;
  }

  return config;
}

function getEndpointCosts() {
  if (cachedEndpointCosts) {
    return cachedEndpointCosts;
  }

  try {
    const rawContents = readFirstExisting([
      process.env.ENDPOINT_COSTS_CONFIG_PATH,
      process.env.LLM_PRICING_CONFIG_PATH,
      DEFAULT_PRICING_PATH,
      LOCAL_CONFIGMAP_PATH,
    ]);
    if (!rawContents) {
      cachedEndpointCosts = {
        modelPricing: {},
        endpointCostConfig: DEFAULT_ENDPOINT_COST_CONFIG,
      };
      return cachedEndpointCosts;
    }

    const pricingYaml = extractPricingYaml(rawContents);
    cachedEndpointCosts = {
      modelPricing: parsePricingYaml(pricingYaml),
      endpointCostConfig: parseEndpointCostConfig(rawContents),
    };
    return cachedEndpointCosts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[config] Failed to load model pricing: ${message}`);
    cachedEndpointCosts = {
      modelPricing: {},
      endpointCostConfig: DEFAULT_ENDPOINT_COST_CONFIG,
    };
    return cachedEndpointCosts;
  }
}

export function getModelPricing(): TModelPricing {
  return getEndpointCosts().modelPricing;
}

export function getEndpointCostConfig(): TEndpointCostConfig {
  return getEndpointCosts().endpointCostConfig;
}

export function clearModelPricingCache(): void {
  cachedEndpointCosts = undefined;
}
