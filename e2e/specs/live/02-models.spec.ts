import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import yaml from 'js-yaml';
import {
  CANARY,
  canaryInstructions,
  deleteCurrentConversation,
  expectCanaryReply,
  selectModel,
  sendMessage,
} from './helpers';

/**
 * Live end-to-end sweep across every model actually deployed for this
 * LibreChat instance, built dynamically from librechat.yaml — no hardcoded
 * model list. Each model gets its own independent test: the matrix is
 * grouped by endpoint but deliberately NOT `test.describe.serial`, so one
 * broken model fails only its own test and every other model still reports
 * its real status in the same run.
 *
 * Source of truth is `endpoints.custom[].models.default` (what's actually
 * deployable), not `modelSpecs.list` (what's shown in the picker) — the two
 * can drift, e.g. a modelSpec referencing a model its endpoint never
 * declared, which wouldn't be a model regression so much as a config bug.
 *
 * Overrides: LIVE_MODELS_YAML (path to an alternate config).
 */
interface CustomEndpointConfig {
  name: string;
  models: { default: string[] };
}

interface LiveYamlConfig {
  endpoints?: { custom?: CustomEndpointConfig[] };
}

interface ModelCase {
  endpoint: string;
  model: string;
}

function loadModelMatrix(): ModelCase[] {
  const yamlPath =
    process.env.LIVE_MODELS_YAML?.trim() || path.resolve(__dirname, '../../../librechat.yaml');
  const config = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as LiveYamlConfig;
  return (config.endpoints?.custom ?? []).flatMap((endpoint) =>
    endpoint.models.default.map((model) => ({ endpoint: endpoint.name, model })),
  );
}

const MODEL_MATRIX = loadModelMatrix();
const ENDPOINTS = [...new Set(MODEL_MATRIX.map((entry) => entry.endpoint))];

const QUESTION = "What's the capital of France?";

test.describe('live models', { tag: ['@live'] }, () => {
  let conversationCreated = false;

  test.afterEach(async ({ page }) => {
    if (conversationCreated) {
      try {
        await deleteCurrentConversation(page);
      } catch (error) {
        console.warn('[live] conversation cleanup failed', error);
      }
      conversationCreated = false;
    }
  });

  for (const endpoint of ENDPOINTS) {
    test.describe(endpoint, () => {
      const cases = MODEL_MATRIX.filter((entry) => entry.endpoint === endpoint);

      for (const { model } of cases) {
        test(`"${model}" responds and follows instructions`, async ({ page }) => {
          test.setTimeout(120000);

          await page.goto('/c/new', { timeout: 15000 });
          await selectModel(page, endpoint, model);

          await sendMessage(page, `${QUESTION} ${canaryInstructions(CANARY)}`);
          conversationCreated = true;

          const reply = page.getByTestId('messages-view').locator('.text-message').last();
          await expect(reply).toBeVisible({ timeout: 45000 });
          await expect(reply).not.toBeEmpty();
          await expectCanaryReply(page, reply, CANARY);
        });
      }
    });
  }
});
