import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Standardized helpers for live specs that interact with the real dev
 * environment. State-mutating helpers are paired with idempotent setters so
 * tests can record-and-restore (see setSkillActive) — never assume defaults.
 */

const SKILL_ACTIVE_SWITCH = 'Toggle skill active state';

/** Open a skill's detail page from the Skills side panel. */
export async function openSkillDetail(page: Page, skillName: string) {
  await page.getByTestId('nav-panel-skills').click();
  await page.getByRole('button', { name: skillName }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: skillName })).toBeVisible({
    timeout: 15000,
  });
}

/** Read a skill's active state without changing it. Leaves the detail open. */
export async function getSkillActive(page: Page, skillName: string): Promise<boolean> {
  await openSkillDetail(page, skillName);
  const toggle = page.getByRole('switch', { name: SKILL_ACTIVE_SWITCH });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  return toggle.isChecked();
}

/**
 * Idempotently set a skill's active state; only toggles when it differs.
 * Returns the state it found before changing it, so callers can restore it.
 */
export async function setSkillActive(
  page: Page,
  skillName: string,
  desired: boolean,
): Promise<boolean> {
  await openSkillDetail(page, skillName);
  const toggle = page.getByRole('switch', { name: SKILL_ACTIVE_SWITCH });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  const previous = (await toggle.getAttribute('aria-checked')) === 'true';

  // The activate mutation is gated on the initial skill-states fetch, so a
  // click fired before it resolves is silently dropped. Retry until the
  // switch actually reflects the desired state.
  const target = String(desired);
  await expect(async () => {
    if ((await toggle.getAttribute('aria-checked')) !== target) {
      await toggle.click();
    }
    expect(await toggle.getAttribute('aria-checked')).toBe(target);
  }).toPass({ timeout: 15000 });

  return previous;
}

/** Start a new chat and select a model under a given endpoint. */
export async function selectModel(page: Page, endpoint: string, model: string) {
  await page.getByTestId('new-chat-button').click();
  await page.getByTestId('model-selector-button').click();
  // Endpoints are hover-activated submenus; the model only mounts once open.
  await page.getByRole('option', { name: endpoint }).hover();
  // Substring match: the option's name also includes a multiplier + "Pin".
  await page.getByRole('option', { name: model }).first().click();
}

/**
 * Toggle a composer tool (e.g. "Skills", "Run Code", "File Search", "Web
 * Search", "Artifacts", "Memory") by its visible label. Idempotent: reads the
 * composer badge and only opens the menu when a change is needed.
 */
export async function setToolEnabled(page: Page, toolLabel: string, enabled: boolean) {
  const badge = page.getByRole('checkbox', { name: toolLabel });
  if ((await badge.isVisible().catch(() => false)) === enabled) {
    return;
  }
  await page.locator('#tools-dropdown-button').click();
  await page.getByRole('menuitem', { name: toolLabel }).click();
  await page.keyboard.press('Escape');
  await (enabled
    ? expect(badge).toBeVisible({ timeout: 10000 })
    : expect(badge).toBeHidden({ timeout: 10000 }));
}

/** Type a prompt into the composer and send it. */
export async function sendMessage(page: Page, text: string) {
  await page.getByTestId('text-input').fill(text);
  await page.getByTestId('send-button').click();
}

/**
 * Delete the currently open conversation via its menu (real UI, no API).
 * The left sidebar is a single rail with mutually exclusive tabs
 * (conversations/agents/skills) — after building an agent, the "agents" tab
 * is left active, so the conversation list (and its "Conversation Menu
 * Options" button) never rendered at all, which is why this used to hang
 * until the outer test timeout killed it. Switch back to the conversations
 * tab first, then scope to the newest conversation item and hover it — same
 * pattern already proven in specs/mock/conversation-management.spec.ts —
 * and give the click its own short timeout so a real failure here surfaces
 * in seconds, not by exhausting the whole test's budget.
 */
export async function deleteCurrentConversation(page: Page) {
  const conversationsTab = page.getByTestId('nav-panel-conversations');
  if ((await conversationsTab.getAttribute('aria-pressed')) !== 'true') {
    await conversationsTab.click();
  }

  const conversation = page.getByTestId('convo-item').first();
  await conversation.hover();
  await conversation
    .getByRole('button', { name: 'Conversation Menu Options' })
    .click({ timeout: 10000 });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
}
