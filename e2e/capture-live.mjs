import { chromium } from '@playwright/test';

// Set E2E_BASE_URL to the dev or UAT site you want to capture an SSO session for
// (e.g. https://dev.example.com or https://uat.example.com).
// command to run: E2E_BASE_URL=https://dev.example.com node e2e/capture-live.mjs
const URL = process.env.E2E_BASE_URL;
if (!URL) {
  console.error('E2E_BASE_URL is required (e.g. https://dev.example.com)');
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });

const context = await browser.newContext();
const page = await context.newPage();
await page.goto(URL);

console.log('\nLog in through SSO in the opened window.');
console.log('When you land on the chat page, come back here and press ENTER.\n');

await new Promise((resolve) => process.stdin.once('data', resolve));

await context.storageState({ path: 'e2e/live-auth.json' });
console.log('Saved session to e2e/live-auth.json');
await browser.close();
process.exit(0);
