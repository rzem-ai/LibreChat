import { expect, test } from '@playwright/test';

test.describe('CI smoke — model picker', { tag: ['@smoke', '@model-specs'] }, () => {
  test('model selector opens and renders at least one option', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });

    const trigger = page.getByRole('button', { name: 'Select a model' }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = page.getByRole('menu').or(page.getByRole('listbox')).first();
    await expect(menu).toBeVisible();

    const options = menu.getByRole('menuitem').or(menu.getByRole('option'));
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThan(0);
  });
});
