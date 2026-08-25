import { expect, test } from '@playwright/test';

/**
 * Read-only smoke against a live environment. Never creates or deletes data —
 * it only asserts that the deployed site loads as an authenticated user and
 * renders real content served from its own database.
 */
test.describe.serial('live smoke', { tag: ['@live'] }, () => {
  test('authenticated session loads the chat shell, not the login page', async ({ page }) => {
    await page.goto('/c/new', { timeout: 15000 });

    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('button', { name: 'Select a model' }).first()).toBeVisible();
  });

  test('model picker renders at least one option', async ({ page }) => {
    await page.goto('/', { timeout: 15000 });

    await page.getByRole('button', { name: 'Select a model' }).first().click();
    await expect(page.getByRole('option').first()).toBeVisible();
  });
});

