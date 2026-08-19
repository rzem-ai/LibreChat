import { chromium } from '@playwright/test';

const URL = process.env.E2E_BASE_URL || 'https://AU-KT4L64D3JW.local';

const browser = await chromium.launch({
  headless: false,
  args: [
    '--host-resolver-rules=MAP AU-KT4L64D3JW.local 127.0.0.1',
    '--ignore-certificate-errors',
  ],
});

const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto(URL);

console.log('\nLog in through SSO in the opened window.');
console.log('When you land on the chat page, come back here and press ENTER.\n');

await new Promise((resolve) => process.stdin.once('data', resolve));

await context.storageState({ path: 'e2e/live-auth.json' });
console.log('Saved session to e2e/live-auth.json');
await browser.close();
process.exit(0);
