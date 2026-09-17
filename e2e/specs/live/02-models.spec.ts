import { expect, test } from '@playwright/test';
import {
  CANARY,
  canaryInstructions,
  deleteCurrentConversation,
  expectCanaryReply,
  loadModelSpecs,
  selectModel,
  sendMessage,
} from './helpers';

/**
 * Live end-to-end sweep across every model actually reachable through the
 * model picker for this LibreChat instance, built dynamically from
 * librechat.yaml — no hardcoded model list. Each model gets its own
 * independent test: the matrix is grouped by endpoint but deliberately NOT
 * `test.describe.serial`, so one broken model fails only its own test and
 * every other model still reports its real status in the same run.
 *
 * Source of truth is `modelSpecs.list` (what's actually in-use, i.e. shown
 * in the picker), not `endpoints.custom[].models.default` (every model an
 * endpoint could serve) — an endpoint's declared models can outnumber what
 * any modelSpec references, and those extra models aren't selectable
 * through the UI at all, so testing them would fail before sending.
 *
 * Overrides: LIVE_MODELS_YAML (path to an alternate config).
 */
const MODEL_MATRIX = loadModelSpecs();
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

      for (const { model, label } of cases) {
        test(`"${label}" responds and follows instructions`, async ({ page }) => {
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
