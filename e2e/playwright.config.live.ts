import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getE2EBaseURL } from './setup/env';

/**
 * LIVE config: points at an already-running site (local Docker now, a deployed
 * dev environment later) and drives it as a real logged-in user. Boots nothing
 * — no server, no in-memory Mongo, no global setup. The session comes from a
 * hand-captured storage state, not a seeded login.
 *
 * Capture the session once (log in by hand, incl. SSO), then run:
 *   npx playwright codegen --save-storage=e2e/live-auth.json http://localhost:3333
 *   E2E_BASE_URL=http://localhost:3333 npx playwright test --config=e2e/playwright.config.live.ts --headed
 *
 * Swap to dev by re-capturing against the dev URL and changing E2E_BASE_URL.
 */
const baseURL = getE2EBaseURL();
const authFile = path.resolve(process.cwd(), 'e2e/live-auth.json');
const hasAuth = fs.existsSync(authFile);
// Lets locked-down runners drive a preinstalled browser (e.g. msedge) instead
// of Playwright's bundled Chromium download.
const channel = process.env.E2E_CHROMIUM_CHANNEL || undefined;

// Chromium ignores macOS mDNS, so map any `.local` host to loopback itself.
const localHost = baseURL.match(/^https?:\/\/([^/:]+\.local)/)?.[1];
const resolverArgs = localHost
  ? [`--host-resolver-rules=MAP ${localHost} 127.0.0.1`, '--ignore-certificate-errors']
  : [];

if (!hasAuth) {
  throw new Error(
    '[e2e:live] e2e/live-auth.json not found — capture it first (codegen --save-storage for local runs, or run e2e/login-live.mjs in CI).',
  );
}

export default defineConfig({
  testDir: 'specs/live/',
  outputDir: 'specs/.test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: Boolean(localHost),
    headless: true,
    storageState: authFile,
  },
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(channel ? { channel } : {}),
        launchOptions: { args: resolverArgs },
      },
    },
  ],
});
