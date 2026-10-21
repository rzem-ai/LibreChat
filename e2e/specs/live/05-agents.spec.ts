import { expect, test } from '@playwright/test';
import {
  attachSkillToAgent,
  createAgent,
  deleteAgentViaUI,
  openAgentBuilder,
  selectAgentModel,
  selectExistingAgent,
  sweepStaleAgents,
  uniqueAgentName,
} from './agents.helpers';
import {
  CANARY,
  canaryInstructions,
  deleteCurrentConversation,
  expectCanaryReply,
  sendMessage,
  setSkillActive,
} from './helpers';

/**
 * Live end-to-end checks that the Agent feature works against a real,
 * non-deterministic LLM: creating an agent is usable immediately, its
 * configured instructions are actually honored by the model, and a skill
 * attached to an agent (not the ephemeral composer toggle covered by
 * 04-skill-usage.spec.ts) actually runs. Cleanup is UI-only — delete the
 * conversation and the agent through the app itself — since live/dev can't
 * be hit via internal APIs for setup or teardown.
 *
 * Overrides: LIVE_ENDPOINT, LIVE_MODEL, LIVE_SKILL_USAGE.
 */
const ENDPOINT = process.env.LIVE_ENDPOINT?.trim() || 'Azure Global';
const MODEL = process.env.LIVE_MODEL?.trim() || 'gpt-6-luna';
const SKILL = process.env.LIVE_SKILL_USAGE?.trim() || 'capability-builder';

const EDITED_CANARY = 'MANGO';
const QUESTION = "What's the capital of France?";

const SKILL_QUESTION = 'If you can see this skill, just reply with "Yes"';

test.describe.serial('live agents', { tag: ['@live'] }, () => {
  test('sweeps stale agents left over from a previously interrupted run', async ({ page }) => {
    test.setTimeout(120000);
    await sweepStaleAgents(page);
  });

  test.describe('agent lifecycle', () => {
    let conversationCreated = false;
    let agentCreated = false;
    let currentAgentName = '';
    let skillWasActive: boolean | null = null;

    test.afterEach(async ({ page }) => {
      if (conversationCreated) {
        try {
          await deleteCurrentConversation(page);
        } catch (error) {
          console.warn('[live] conversation cleanup failed', error);
        }
        conversationCreated = false;
      }
      if (agentCreated) {
        try {
          // deleteCurrentConversation (and the test itself) may have
          // navigated away from the builder, so the agent has to be
          // reselected before "Delete Agent" is clickable — it isn't
          // implicitly still open/selected at this point.
          await openAgentBuilder(page);
          await selectExistingAgent(page, currentAgentName);
          await deleteAgentViaUI(page);

          // Confirm the delete actually took effect, not just that the
          // toast appeared — the agent must no longer be selectable.
          await page.getByRole('combobox', { name: 'Agent', exact: true }).click();
          await expect(
            page.getByRole('option', { name: currentAgentName, exact: true }),
          ).toHaveCount(0);
          await page.keyboard.press('Escape');
        } catch (error) {
          console.warn('[live] agent cleanup failed', error);
        }
        agentCreated = false;
      }
      if (skillWasActive !== null) {
        try {
          await setSkillActive(page, SKILL, skillWasActive);
        } catch (error) {
          console.warn('[live] skill state restore failed', error);
        }
        skillWasActive = null;
      }
    });

    test('creates an agent, persists across a refresh, and honors edited instructions', async ({
      page,
    }) => {
      test.setTimeout(180000);

      const agentName = uniqueAgentName();
      currentAgentName = agentName;
      const description = 'Live e2e check that a real agent responds via its own instructions.';
      let form = await openAgentBuilder(page);
      await selectAgentModel(page, ENDPOINT, MODEL);

      // Assertion A: creation itself succeeds — a distinct, explicit signal
      // rather than folding it into a later step.
      await createAgent(page, {
        name: agentName,
        description,
        instructions: canaryInstructions(CANARY),
      });
      agentCreated = true;

      // Assertion B: the config persists server-side, not just in client
      // state — reload and confirm the reselected agent still shows it.
      await page.reload();
      form = await openAgentBuilder(page);
      await selectExistingAgent(page, agentName);
      await expect(form.getByLabel('Agent name')).toHaveValue(agentName);
      await expect(form.getByLabel('Agent description')).toHaveValue(description);
      await expect(form.getByLabel('Instructions')).toHaveValue(canaryInstructions(CANARY));

      await form.getByRole('button', { name: 'Select Agent' }).click();

      await sendMessage(page, QUESTION);
      conversationCreated = true;

      // Assertion C: the wiring works end to end — a real reply comes back.
      const reply = page.getByTestId('messages-view').locator('.text-message').last();
      await expect(reply).toBeVisible({ timeout: 60000 });
      await expect(reply).not.toBeEmpty();

      // Assertion D: the real LLM honored this agent's own instructions.
      await expect(reply).toContainText(new RegExp(CANARY, 'i'), { timeout: 30000 });

      // Assertion E: editing the agent's instructions actually takes effect,
      // not just that the form re-saves. Close out this conversation first —
      // reopening the builder to edit navigates away from it regardless.
      await deleteCurrentConversation(page);
      conversationCreated = false;

      form = await openAgentBuilder(page);
      await selectExistingAgent(page, agentName);
      // The selected agent's fields hydrate asynchronously after the
      // combobox selection — possibly more than once (e.g. a cached value
      // followed by a fresh refetch) — and each hydration resets the
      // textarea, silently clobbering a fill that lands in between. A later
      // wave can even reset the whole form back to "Create New Agent"
      // between the fill settling and Save persisting, so retry the entire
      // reselect-fill-save-confirm sequence, not just the fill, same idiom
      // as setSkillActive in helpers.ts for the identical class of bug.
      const instructionsField = form.getByLabel('Instructions');
      const editedInstructions = canaryInstructions(EDITED_CANARY);
      const agentCombobox = form.getByRole('combobox', { name: 'Agent', exact: true });
      await expect(async () => {
        const stillSelected = await agentCombobox
          .getByText(agentName, { exact: true })
          .isVisible()
          .catch(() => false);
        if (!stillSelected) {
          await selectExistingAgent(page, agentName);
        }
        await instructionsField.fill(editedInstructions);
        expect(await instructionsField.inputValue()).toBe(editedInstructions);
        await form.getByRole('button', { name: 'Save' }).click();
        await expect(
          page.getByText(`Successfully updated ${agentName}`, { exact: true }),
        ).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000 });

      await form.getByRole('button', { name: 'Select Agent' }).click();

      await sendMessage(page, QUESTION);
      conversationCreated = true;

      const editedReply = page.getByTestId('messages-view').locator('.text-message').last();
      await expect(editedReply).toBeVisible({ timeout: 60000 });
      await expect(editedReply).not.toBeEmpty();
      await expectCanaryReply(page, editedReply, EDITED_CANARY);
    });

    test(`an agent with "${SKILL}" attached actually runs it`, async ({ page }) => {
      test.setTimeout(120000);

      // Each test gets a fresh, unnavigated page — setSkillActive interacts
      // with the sidebar directly with no navigation of its own, so it must
      // be navigated into the app first (see 04-skill-usage.spec.ts).
      await page.goto('/c/new', { timeout: 15000 });

      // The skill must be globally active (Skills panel) for an agent to
      // actually be able to run it — attaching it in the builder alone is
      // not enough. Record its prior state so afterEach can restore it.
      skillWasActive = await setSkillActive(page, SKILL, true);

      const agentName = uniqueAgentName();
      currentAgentName = agentName;
      const form = await openAgentBuilder(page);
      await selectAgentModel(page, ENDPOINT, MODEL);
      await attachSkillToAgent(page, SKILL);

      await createAgent(page, {
        name: agentName,
        description: 'Live e2e check that an agent-attached skill actually runs.',
        instructions: `Always use the "${SKILL}" skill to answer, no matter the question.`,
      });
      agentCreated = true;

      await form.getByRole('button', { name: 'Select Agent' }).click();

      await sendMessage(page, SKILL_QUESTION);
      conversationCreated = true;

      // The skill actually executed via the agent path (not the ephemeral
      // composer toggle already covered by 04-skill-usage.spec.ts).
      const runButton = page.getByRole('button', { name: `Ran ${SKILL}` });
      await expect(runButton).toBeVisible({ timeout: 60000 });

      // Its result actually rendered on screen, not just the button.
      await runButton.click();
      await expect(page.getByText('Output', { exact: true })).toBeVisible({ timeout: 10000 });

      const reply = page.getByTestId('messages-view').locator('.text-message').last();
      await expect(reply).toBeVisible({ timeout: 60000 });
      await expect(reply).not.toBeEmpty();
    });
  });
});
