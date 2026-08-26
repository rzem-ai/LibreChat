import { expect, test } from '@playwright/test';

test.describe('CI smoke — app load', { tag: '@smoke' }, () => {
  test('authenticated user lands on the chat shell without runtime errors', async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => pageErrors.push(error));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/', { timeout: 10000 });

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a model' }).first()).toBeVisible();

    expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`)
      .toHaveLength(0);
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  test('navigating directly to /c/new renders the new-chat shell', async ({ page }) => {
    await page.goto('/c/new', { timeout: 10000 });

    await expect(page).toHaveURL(/\/c\/new$/);
    await expect(page.getByRole('link', { name: 'New chat' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });
});
