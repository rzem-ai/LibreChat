import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

/**
 * Unattended counterpart to capture-live.mjs: logs a dedicated test account
 * into a real environment and writes the session to e2e/live-auth.json for
 * playwright.config.live.ts to reuse. Never waits for human input — any
 * failure exits non-zero so CI goes red instead of hanging.
 *
 * Required env: E2E_BASE_URL, E2E_USER, E2E_PASS
 */

const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_USER;
const password = process.env.E2E_PASS;
const authFile = path.resolve(process.cwd(), 'e2e/live-auth.json');
const timeout = Number(process.env.E2E_LOGIN_TIMEOUT ?? 30000);

const missing = [
  ['E2E_BASE_URL', baseURL],
  ['E2E_USER', email],
  ['E2E_PASS', password],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`[login-live] missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

function appURL(pathname) {
  const normalized = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return new URL(pathname.replace(/^\/+/, ''), normalized).toString();
}

/**
 * Drives the Microsoft Entra ID login pages. This is inherently the most
 * fragile part of the script — Microsoft changes this markup periodically —
 * so every step waits for its own element rather than assuming a fixed
 * number of pages, and optional prompts (KMSI, consent) are best-effort.
 */
async function loginViaMicrosoftSSO(page, user, pass) {
  await page.locator('input[type="email"]').fill(user, { timeout });
  await page.locator('#idSIButton9').click();

  // Some tenants show a "Working... redirecting" interstitial between the
  // email and password screens; wait for the password field rather than a
  // fixed delay.
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout });
  await page.locator('input[type="password"]').fill(pass);
  await page.locator('#idSIButton9').click();

  // "Stay signed in?" (KMSI) prompt — only appears sometimes. Accepting it
  // gives a longer-lived session, which is what we want for a captured
  // storageState. Best-effort: don't fail the run if it never appears.
  await page
    .locator('#idSIButton9')
    .click({ timeout: 10000 })
    .catch(() => {});
}

// Chromium ignores macOS mDNS, so map any `.local` host to loopback itself.
const localHost = baseURL.match(/^https?:\/\/([^/:]+\.local)/)?.[1];
const args = localHost
  ? [`--host-resolver-rules=MAP ${localHost} 127.0.0.1`, '--ignore-certificate-errors']
  : [];

const browser = await chromium.launch({
  headless: true,
  args,
  ...(process.env.E2E_CHROMIUM_CHANNEL ? { channel: process.env.E2E_CHROMIUM_CHANNEL } : {}),
});
const context = await browser.newContext({ ignoreHTTPSErrors: Boolean(localHost) });
const page = await context.newPage();

try {
  console.log(`[login-live] signing in at ${baseURL}`);

  await page.goto(appURL('login'), { waitUntil: 'domcontentloaded', timeout });
  const emailField = page.getByLabel('Email');

  if (await emailField.isVisible({ timeout: 10000 }).catch(() => false)) {
    await emailField.fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByTestId('login-button').click();
  } else {
    // This deployment has OPENID_AUTO_REDIRECT enabled: the app leaves
    // /login for /oauth/openid within a fraction of a second via
    // window.location.href, so waiting for and clicking the SSO button is a
    // race we can lose. Go straight to the endpoint it redirects to instead.
    console.log('[login-live] no email/password form — going to SSO endpoint directly');
    await page.goto(appURL('oauth/openid'), { waitUntil: 'domcontentloaded', timeout });
    await page.waitForURL((url) => url.hostname === 'login.microsoftonline.com', { timeout });
    await loginViaMicrosoftSSO(page, email, password);
  }

  await page.waitForURL((url) => !/\/login(\?|$)/.test(url.pathname + url.search), { timeout });
  await page.getByTestId('text-input').waitFor({ state: 'visible', timeout });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  console.log(`[login-live] session saved to ${authFile}`);
} catch (error) {
  console.error('[login-live] login failed:', error.message);
  console.error(`[login-live] landed on: ${page.url()}`);
  const screenshotPath = path.resolve(process.cwd(), 'e2e/specs/.test-results/login-live-failure.png');
  try {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 });
    console.error(`[login-live] failure screenshot saved to ${screenshotPath}`);
  } catch (screenshotError) {
    console.error('[login-live] could not save failure screenshot:', screenshotError.message);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
