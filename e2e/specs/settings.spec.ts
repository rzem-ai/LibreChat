import { expect, test } from '@playwright/test';

test.describe('CI smoke — settings modal', { tag: '@smoke' }, () => {
  test('opens the settings modal from the user menu and closes it', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();

    const modal = page.getByRole('dialog', { name: /Settings/ });
    await expect(modal.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(modal.getByRole('tablist', { name: 'Settings' })).toBeVisible();
    await expect(modal.getByRole('tabpanel', { name: 'General' })).toBeVisible();

    await modal.getByRole('button', { name: 'Close Settings' }).click();
    await expect(modal).toBeHidden();
  });
});
