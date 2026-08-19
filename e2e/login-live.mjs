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
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

try {
  console.log(`[login-live] signing in as ${email} at ${baseURL}`);
  await page.goto(appURL('login'), { waitUntil: 'domcontentloaded', timeout });

  const emailField = page.getByLabel('Email');
  if (!(await emailField.isVisible({ timeout: 10000 }).catch(() => false))) {
    throw new Error(
      'no email/password form on /login — target is SSO-only, so this script needs an SSO flow or ALLOW_EMAIL_LOGIN enabled on the environment',
    );
  }

  await emailField.fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('login-button').click();

  await page.waitForURL((url) => !/\/login(\?|$)/.test(url.pathname + url.search), { timeout });
  await page.getByTestId('text-input').waitFor({ state: 'visible', timeout });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  console.log(`[login-live] session saved to ${authFile}`);
} catch (error) {
  console.error('[login-live] login failed:', error.message);
  console.error(`[login-live] landed on: ${page.url()}`);
  await page
    .screenshot({ path: 'e2e/specs/.test-results/login-live-failure.png', fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
