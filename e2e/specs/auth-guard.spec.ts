import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('CI smoke — auth guard', { tag: ['@smoke', '@auth'] }, () => {
  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/c/new', { timeout: 10000 });

    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByTestId('login-button')).toBeVisible();
  });

  test('unauthenticated visit to the app root lands on login', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });

    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId('login-button')).toBeVisible();
  });
});
