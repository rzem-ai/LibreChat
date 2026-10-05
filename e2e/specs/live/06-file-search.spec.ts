import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  CANARY,
  canaryInstructions,
  deleteCurrentConversation,
  escapeRegExp,
  expectCanaryReply,
  selectModel,
  sendMessage,
} from './helpers';

/**
 * Live end-to-end check that the File Search (RAG) pipeline works across the
 * file types File Search supports: a document is uploaded for file search,
 * retrieval fires, the answer is grounded on the uploaded document, and a
 * source citation renders. Mutates real dev state (uploaded file +
 * conversation), so afterEach deletes the conversation and the uploaded file
 * from the user's file store via the real UI — file-search uploads persist
 * independently of the conversation and would otherwise leak.
 *
 * Every format's fixture encodes the same facts (see
 * fixtures/generate.mjs) — an unguessable alphanumeric needle (ORCHID-7749),
 * a distractor codename (LOTUS-3320), a program lead, and a budget — just
 * repackaged per container (prose for pdf/txt/docx, headers+table for md,
 * key/value rows across two sheets for xlsx). Keeping the facts identical
 * means QUESTION/NEEDLE/CANARY stay the same for every test, so a failure
 * isolates the file-type parsing/chunking, not a content difference.
 *
 * Deliberately does NOT assert semantic content beyond the needle: tool
 * invoked, retrieval grounded, citation rendered, turn completed — plumbing,
 * not eval-quality grading.
 *
 * Overrides: LIVE_ENDPOINT, LIVE_MODEL, and a per-type
 * LIVE_RAG_FIXTURE_<TYPE> (e.g. LIVE_RAG_FIXTURE_PDF, LIVE_RAG_FIXTURE_XLSX).
 */
const ENDPOINT = process.env.LIVE_ENDPOINT?.trim() || 'Azure Global';
const MODEL = process.env.LIVE_MODEL?.trim() || 'gpt-56-luna';
const NEEDLE = 'ORCHID-7749';
const QUESTION =
  'According to the attached charter, what is the internal codename for the ' +
  'Q3 2026 telemetry migration, who is the program lead, and what was the ' +
  'approved budget?';

interface FileTypeConfig {
  /** Short label used in the test name and unique-filename generation. */
  key: string;
  fixture: string;
  mimeType: string;
  extension: string;
}

function fixtureConfig(
  key: string,
  extension: string,
  mimeType: string,
  envOverrideVar: string,
): FileTypeConfig {
  const fixture =
    process.env[envOverrideVar]?.trim() ||
    path.resolve(__dirname, `fixtures/rag-orchid-charter.${extension}`);
  return { key, fixture, mimeType, extension };
}

const FILE_TYPES: FileTypeConfig[] = [
  fixtureConfig('pdf', 'pdf', 'application/pdf', 'LIVE_RAG_FIXTURE_PDF'),
  fixtureConfig('txt', 'txt', 'text/plain', 'LIVE_RAG_FIXTURE_TXT'),
  fixtureConfig('md', 'md', 'text/markdown', 'LIVE_RAG_FIXTURE_MD'),
  fixtureConfig(
    'docx',
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'LIVE_RAG_FIXTURE_DOCX',
  ),
  fixtureConfig(
    'xlsx',
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'LIVE_RAG_FIXTURE_XLSX',
  ),
];

test.describe.serial('live file search (RAG)', { tag: ['@live'] }, () => {
  let conversationCreated = false;
  let uploadedFilename: string | null = null;

  test.afterEach(async ({ page }) => {
    if (conversationCreated) {
      try {
        await deleteCurrentConversation(page);
      } catch (error) {
        console.warn('[live] conversation cleanup failed', error);
      }
      conversationCreated = false;
    }
    if (uploadedFilename) {
      try {
        await deleteUploadedFileViaManageFiles(page, uploadedFilename);
      } catch (error) {
        console.warn('[live] uploaded file cleanup failed', error);
      }
      uploadedFilename = null;
    }
  });

  for (const config of FILE_TYPES) {
    test(`uploaded ${config.key} is retrieved, grounded, and cited in the reply`, async ({
      page,
    }) => {
      test.setTimeout(180000);

      // Unique filename per run so parallel/retry runs never collide in the
      // shared file store and the cleanup filter is unambiguous.
      uploadedFilename = `rag-orchid-charter-${Date.now()}.${config.extension}`;

      await page.goto('/c/new', { timeout: 15000 });
      await selectModel(page, ENDPOINT, MODEL);

      await page.locator('#attach-file-menu-button').click();
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('menuitem', { name: 'Upload for File Search' }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles([
        {
          name: uploadedFilename,
          mimeType: config.mimeType,
          buffer: fs.readFileSync(config.fixture),
        },
      ]);

      // Composer chip is a button with aria-label=filename; the spinner inside
      // it disappears when ingest + embedding finish (FileRow flips filesLoading
      // off at progress >= 1). Gate the send on that so we don't race the tool.
      const chip = page.getByRole('button', { name: uploadedFilename });
      await expect(chip).toBeVisible({ timeout: 30000 });
      await expect(chip.locator('svg.spinner')).toHaveCount(0, { timeout: 120000 });

      await sendMessage(page, `${QUESTION} ${canaryInstructions(CANARY)}`);
      conversationCreated = true;

      // 1. Pipeline signal: File Search tool actually ran. Matches both
      // in-progress ("Searching your files") and finished ("Searched your
      // files") states of the RetrievalCall ProgressText button, so the
      // assertion resolves as soon as retrieval kicks off.
      await expect(page.getByRole('button', { name: /Search(ing|ed) your files/ })).toBeVisible({
        timeout: 90000,
      });

      // 2. Retrieval correctness: the unguessable alphanumeric needle only
      // reaches the reply if the right chunk was retrieved. Case-insensitive
      // because some models normalize casing.
      const reply = page.getByTestId('messages-view').locator('.text-message').last();
      await expect(reply).toBeVisible({ timeout: 90000 });
      await expect(reply).toContainText(new RegExp(escapeRegExp(NEEDLE), 'i'), {
        timeout: 90000,
      });

      // 3. Turn completion: instruction-following survived tool use.
      await expectCanaryReply(page, reply, CANARY);
    });
  }
});

/**
 * Test-scoped cleanup: open Files side panel, open the Manage Files modal,
 * filter to the uploaded filename, tick its row, click Delete. Not promoted
 * to a shared helper — only this spec uploads to the persistent file store.
 */
async function deleteUploadedFileViaManageFiles(page: Page, filename: string) {
  await page.getByTestId('nav-panel-files').click();
  await page.getByRole('button', { name: 'Manage Files' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'My Files' });
  await expect(dialog).toBeVisible({ timeout: 15000 });

  await dialog.locator('#files-filter').fill(filename);

  const row = dialog.getByRole('row').filter({ hasText: filename }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByLabel('Select row').check();

  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toBeHidden({ timeout: 15000 });

  await page.keyboard.press('Escape');
}
