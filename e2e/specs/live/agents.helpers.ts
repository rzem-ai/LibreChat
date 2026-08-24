import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { escapeRegExp } from './helpers';

/**
 * Agent-specific helpers for live specs. UI-only, end to end — no direct API
 * calls — since live/dev environments can't be hit for setup or teardown
 * outside the app itself. Reimplemented locally (not imported from
 * specs/mock/agents.helpers.ts) so live specs never depend on mock-only code.
 */

const AGENT_NAME_PREFIX = 'E2E Live Agent';

export const uniqueAgentName = (prefix = AGENT_NAME_PREFIX) =>
  `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** Open the Agent Builder panel from a fresh chat. */
export async function openAgentBuilder(page: Page): Promise<Locator> {
  await page.goto('/c/new', { timeout: 10000 });

  const form = page.getByRole('form', { name: 'Agent configuration form' });
  const builderVisible = await form
    .waitFor({ state: 'visible', timeout: 1000 })
    .then(() => true)
    .catch(() => false);
  if (!builderVisible) {
    const agentBuilderButton = page.getByRole('button', { name: 'Agent Builder' });
    await expect(agentBuilderButton).toBeVisible();
    if ((await agentBuilderButton.getAttribute('aria-pressed')) !== 'true') {
      await agentBuilderButton.click();
    }
  }
  await expect(form).toBeVisible();
  return form;
}

/** Select a real provider + model inside the agent's Model Parameters panel. */
export async function selectAgentModel(page: Page, endpoint: string, model: string) {
  const form = page.getByRole('form', { name: 'Agent configuration form' });

  await form.locator('label[for="provider"] + button').click();
  await expect(form.getByText('Model Parameters', { exact: true })).toBeVisible();

  await form.getByRole('combobox', { name: 'Provider' }).click();
  await page.getByRole('option', { name: endpoint }).click();

  await form.getByRole('combobox', { name: 'Model' }).click();
  await page.getByRole('option', { name: model, exact: true }).click();

  await form.getByRole('button', { name: 'Back to builder' }).click();
  await expect(form).toBeVisible();
}

/** Fill and submit the agent form, waiting for the create success toast. */
export async function createAgent(
  page: Page,
  { name, description, instructions }: { name: string; description: string; instructions: string },
) {
  const form = page.getByRole('form', { name: 'Agent configuration form' });

  await form.getByLabel('Agent name').fill(name);
  await form.getByLabel('Agent description').fill(description);
  await form.getByLabel('Instructions').fill(instructions);

  await form.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(`Successfully created ${name}`, { exact: true })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Attach a skill to the agent being built via the Tools section's "Add
 * Skills" dialog. Searches first when a search box is present — real
 * dev/live tenants can carry far more skills than a test env, where the
 * target skill may not be visible without it.
 */
export async function attachSkillToAgent(page: Page, skillName: string) {
  const form = page.getByRole('form', { name: 'Agent configuration form' });

  await form.getByRole('button', { name: 'Add Skills' }).click();
  const search = page.getByRole('textbox', { name: 'Search skills...' });
  if (await search.isVisible({ timeout: 1000 }).catch(() => false)) {
    await search.fill(skillName);
  }
  await page.getByRole('button', { name: skillName }).first().click();
  await page.keyboard.press('Escape');
}

/** Select an existing agent by name into the builder form. */
export async function selectExistingAgent(page: Page, agentName: string) {
  const form = page.getByRole('form', { name: 'Agent configuration form' });
  await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
  await page.getByRole('option', { name: agentName, exact: true }).click();
}

/** Delete the agent currently open in the builder, via its own UI (not the API). */
export async function deleteAgentViaUI(page: Page) {
  await page.getByRole('button', { name: 'Delete Agent' }).click();
  await expect(page.getByText('Are you sure you want to delete this agent?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Successfully deleted agent', { exact: true })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Self-healing sweep: delete any agent left over from a previous run that
 * crashed before its own afterEach ran, matched by name prefix rather than a
 * full timestamped name (which is unique per run by design and would never
 * match a leftover). Loops until no more matches are found.
 */
export async function sweepStaleAgents(page: Page, prefix = AGENT_NAME_PREFIX) {
  const form = await openAgentBuilder(page);
  const agentCombobox = form.getByRole('combobox', { name: 'Agent', exact: true });
  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}`);

  for (let guard = 0; guard < 25; guard++) {
    await agentCombobox.click();
    const stale = page.getByRole('option', { name: prefixPattern }).first();
    const found = await stale.isVisible({ timeout: 2000 }).catch(() => false);
    if (!found) {
      await page.keyboard.press('Escape');
      return;
    }
    await stale.click();
    await deleteAgentViaUI(page);
  }
}
