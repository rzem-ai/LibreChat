import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Read-only checks of the Skills section on a live environment. Maintains a
 * list of expected skills and verifies each one via the panel's search — no
 * mutations, no hard-coded single skill. Add a skill name to EXPECTED_SKILLS
 * to cover it. Set LIVE_SKILLS="a,b,c" to override the list without code edits.
 */
const EXPECTED_SKILLS = (process.env.LIVE_SKILLS ?? 'capability-builder')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

async function searchSkills(page: Page, term: string) {
  await page.goto('/c/new', { timeout: 15000 });
  await page.getByTestId('nav-panel-skills').click();
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search skills...' }).fill(term);
}

test.describe.serial('live skills', { tag: ['@live'] }, () => {
  for (const skillName of EXPECTED_SKILLS) {
    test(`skill "${skillName}" is available and opens its detail`, async ({ page }) => {
      await searchSkills(page, skillName);

      const entry = page.getByText(skillName, { exact: true }).first();
      await expect(entry).toBeVisible({ timeout: 15000 });

      await entry.click();
      await expect(
        page.getByRole('heading', { level: 2, name: skillName }),
      ).toBeVisible({ timeout: 15000 });
    });
  }
});

