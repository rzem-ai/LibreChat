import { expect, test } from '@playwright/test';
import {
  setSkillActive,
  selectModel,
  setToolEnabled,
  sendMessage,
  deleteCurrentConversation,
} from './helpers';

/**
 * Live end-to-end check that a skill can be enabled, mentioned, and actually
 * runs in a real chat. This test MUTATES real dev state (skill active flag +
 * a conversation), so afterEach reverts everything: the conversation is
 * deleted via the UI and the skill's active state is restored to whatever it
 * was before the test — never an assumed default.
 *
 * Overrides: LIVE_SKILL_USAGE (skill name), LIVE_ENDPOINT, LIVE_MODEL.
 */
const SKILL = process.env.LIVE_SKILL_USAGE?.trim() || 'capability-builder';
const ENDPOINT = process.env.LIVE_ENDPOINT?.trim() || 'Azure Global';
const MODEL = process.env.LIVE_MODEL?.trim() || 'gpt-6-luna';
const QUESTION = 'If you can see this skill, just reply with "Yes"';

test.describe.serial('live skill usage', { tag: ['@live'] }, () => {
  let initialActive: boolean | null = null;
  let conversationCreated = false;

  test.afterEach(async ({ page }) => {
    try {
      await setToolEnabled(page, 'Skills', false);
    } catch (error) {
      console.warn('[live] skills tool disable failed', error);
    }
    if (conversationCreated) {
      try {
        await deleteCurrentConversation(page);
      } catch (error) {
        console.warn('[live] conversation cleanup failed', error);
      }
      conversationCreated = false;
    }
    if (initialActive !== null) {
      try {
        await setSkillActive(page, SKILL, initialActive);
      } catch (error) {
        console.warn('[live] skill state restore failed', error);
      }
      initialActive = null;
    }
  });

  test(`enabling "${SKILL}" makes it usable and it runs in a chat`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/c/new', { timeout: 15000 });

    // Open the detail once, turn it on, and remember its prior state to restore.
    initialActive = await setSkillActive(page, SKILL, true);

    await selectModel(page, ENDPOINT, MODEL);
    await setToolEnabled(page, 'Skills', true);

    // Arm the skill via the `$` popover, which only appears once Skills is on.
    // Must be a real keystroke: the popover is triggered on keyup, which
    // fill() does not dispatch.
    const composer = page.getByTestId('text-input');
    await composer.click();
    await composer.pressSequentially('$'); //using pressSequentially to avoid issues with keyup not being triggered
    const skillOption = page.getByRole('button', { name: new RegExp(`^${SKILL}`) }).first();
    await expect(skillOption).toBeVisible({ timeout: 10000 });
    await skillOption.click();

    await sendMessage(page, QUESTION);
    conversationCreated = true;

    // Deterministic signals only (model prose is non-deterministic): the skill
    // executed, and an assistant reply came back.
    await expect(page.getByRole('button', { name: `Ran ${SKILL}` })).toBeVisible({
      timeout: 60000,
    });
    //sees the reply message, which is the only deterministic signal that the skill actually ran and returned a response
    const reply = page.getByTestId('messages-view').locator('.text-message').last();
    await expect(reply).toBeVisible({ timeout: 60000 });
    await expect(reply).not.toBeEmpty();
  });
});
