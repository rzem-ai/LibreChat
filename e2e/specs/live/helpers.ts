import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Standardized helpers for live specs that interact with the real dev
 * environment. State-mutating helpers are paired with idempotent setters so
 * tests can record-and-restore (see setSkillActive) — never assume defaults.
 */

const SKILL_ACTIVE_SWITCH = 'Toggle skill active state';

interface ModelSpecConfig {
  name: string;
  label?: string;
  preset: { endpoint: string; model: string };
}

interface LiveYamlConfig {
  modelSpecs?: { list?: ModelSpecConfig[] };
}

export interface ModelSpecCase {
  endpoint: string;
  model: string;
  label: string;
}

let cachedModelSpecs: ModelSpecCase[] | undefined;

/** Every modelSpec in librechat.yaml, i.e. every model actually reachable through the picker. */
export function loadModelSpecs(): ModelSpecCase[] {
  if (cachedModelSpecs) {
    return cachedModelSpecs;
  }
  const yamlPath =
    process.env.LIVE_MODELS_YAML?.trim() || path.resolve(__dirname, '../../../librechat.yaml');
  const config = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as LiveYamlConfig;
  cachedModelSpecs = (config.modelSpecs?.list ?? []).map((spec) => ({
    endpoint: spec.preset.endpoint,
    model: spec.preset.model,
    label: spec.label ?? spec.preset.model,
  }));
  return cachedModelSpecs;
}

/**
 * Append-style canary marker (OWASP LLM guidance / LangChain4j's guardrail
 * pattern): ask the model to answer normally, then append a fixed marker on
 * its own line. This is followed far more reliably by small/nano models than
 * a replace-style "respond with exactly one word" instruction, which reads as
 * a stranger, higher-risk instruction and can trigger a clarifying question
 * instead of compliance.
 */
export const CANARY = 'PINEAPPLE';

/** Escape regex special characters so a literal string can be used inside `new RegExp()`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function canaryInstructions(word: string) {
  return (
    "Answer the user's question in one short sentence, nothing longer. Then, on a new line " +
    `at the very end of your reply, add exactly this text and nothing else on that line: ${word}`
  );
}

// Even an append-style marker has a small non-zero miss rate on weaker
// models; tolerate exactly one miss with a nudge before failing the test.
function canaryNudge(word: string) {
  return (
    `You forgot to include the required marker on its own line: ${word}. Please resend your ` +
    'prior answer with it included.'
  );
}

export async function expectCanaryReply(page: Page, reply: Locator, word: string) {
  const hasCanary = await reply
    .getByText(new RegExp(word, 'i'))
    .isVisible({ timeout: 30000 })
    .catch(() => false);
  if (!hasCanary) {
    await sendMessage(page, canaryNudge(word));
    const nudgedReply = page.getByTestId('messages-view').locator('.text-message').last();
    await expect(nudgedReply).toContainText(new RegExp(word, 'i'), { timeout: 30000 });
  }
}

/** Open a skill's detail page from the Skills side panel. */
export async function openSkillDetail(page: Page, skillName: string) {
  await page.getByTestId('nav-panel-skills').click();
  await page.getByRole('button', { name: skillName }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: skillName })).toBeVisible({
    timeout: 15000,
  });
}

/** Read a skill's active state without changing it. Leaves the detail open. */
export async function getSkillActive(page: Page, skillName: string): Promise<boolean> {
  await openSkillDetail(page, skillName);
  const toggle = page.getByRole('switch', { name: SKILL_ACTIVE_SWITCH });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  return (await toggle.getAttribute('aria-checked')) === 'true';
}

/**
 * Idempotently set a skill's active state; only toggles when it differs.
 * Returns the state it found before changing it, so callers can restore it.
 */
export async function setSkillActive(
  page: Page,
  skillName: string,
  desired: boolean,
): Promise<boolean> {
  await openSkillDetail(page, skillName);
  const toggle = page.getByRole('switch', { name: SKILL_ACTIVE_SWITCH });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  const previous = (await toggle.getAttribute('aria-checked')) === 'true';

  // The activate mutation is gated on the initial skill-states fetch, so a
  // click fired before it resolves is silently dropped. Retry until the
  // switch actually reflects the desired state.
  const target = String(desired);
  await expect(async () => {
    if ((await toggle.getAttribute('aria-checked')) !== target) {
      await toggle.click();
    }
    expect(await toggle.getAttribute('aria-checked')).toBe(target);
  }).toPass({ timeout: 15000 });

  return previous;
}

/**
 * Start a new chat and select a model under a given endpoint. Waits for the
 * URL to actually land on `/c/new` before opening the picker — clicking
 * `model-selector-button` right after `new-chat-button` can otherwise race
 * the conversation-reset state update, so the click lands on a stale render
 * and silently does nothing (same pattern already used in
 * specs/mock/soft-default.spec.ts).
 */
export async function selectModel(page: Page, endpoint: string, model: string) {
  if (!/\/c\/new\/?$/.test(new URL(page.url()).pathname)) {
    await page.getByTestId('new-chat-button').click();
    await expect(page).toHaveURL(/\/c\/new\/?$/, { timeout: 15000 });
  }
  await page.getByTestId('model-selector-button').click();
  // Skip the hover-activated submenu tree entirely: type into the picker's
  // search box, which flattens results and renders the matching model option
  // at the top level (see renderSearchResults in ModelSelector.tsx).
  const search = page.locator('#model-search');

  // A modelSpec-backed option renders with its display label as the option's
  // accessible name (e.g. "gpt-56-luna" renders as "GPT 5.6 Luna" — see
  // SearchResults.tsx), never the raw model id. Search and match on that
  // label when the endpoint/model pair is behind a spec; otherwise (a bare
  // endpoint/model with no spec) the option's name is the raw model id.
  const spec = loadModelSpecs().find((s) => s.endpoint === endpoint && s.model === model);
  const searchTerm = spec
    ? spec.label
    : model.includes('/')
      ? model.split('/').pop()!
      : model;
  await search.fill(searchTerm);
  const escapedSearch = escapeRegExp(searchTerm);
  const namePattern = spec
    ? new RegExp(`^${escapedSearch}(\\s|$)`)
    : new RegExp(`^(${escapeRegExp(endpoint)} )?${escapedSearch}(\\s|$)`);
  await page.getByRole('option', { name: namePattern }).first().click();
  // Confirm the trigger actually reflects the new selection before returning —
  // callers send a message right after this call, and without this wait that
  // send can fire while the endpoint/model switch is still in flight.
  await expect(page.getByTestId('model-selector-button')).toContainText(searchTerm, {
    timeout: 15000,
  });
}

/**
 * Toggle a composer tool (e.g. "Skills", "Run Code", "File Search", "Web
 * Search", "Artifacts", "Memory") by its visible label. Idempotent: reads
 * the badge's `aria-checked` and only clicks when a change is needed.
 * Visibility is NOT a reliable state signal — pinned tools (see
 * `interface.defaultPinnedTools` in librechat.yaml) stay mounted below the
 * composer regardless of their toggle state and just change colour when
 * checked (green submit surface vs neutral). Clicks the badge itself
 * directly rather than going through the `#tools-dropdown-button` menu —
 * only works for tools pinned by default or already enabled, since an
 * unpinned/disabled tool's badge isn't in the DOM at all.
 */
export async function setToolEnabled(page: Page, toolLabel: string, enabled: boolean) {
  const badge = page.getByRole('checkbox', { name: toolLabel });
  const isCurrentlyEnabled = async () => {
    if ((await badge.count()) === 0) {
      // Badge isn't in the DOM at all — the tool is off and unpinned.
      return false;
    }
    return (await badge.first().getAttribute('aria-checked')) === 'true';
  };
  if ((await isCurrentlyEnabled()) === enabled) {
    return;
  }
  await expect(badge.first()).toBeVisible({ timeout: 10000 });
  await badge.first().click();
  await expect(async () => {
    expect(await isCurrentlyEnabled()).toBe(enabled);
  }).toPass({ timeout: 10000 });
}

/** Type a prompt into the composer and send it. */
export async function sendMessage(page: Page, text: string) {
  await page.getByTestId('text-input').fill(text);
  await page.getByTestId('send-button').click();
}

/**
 * Delete the currently open conversation via its menu (real UI, no API).
 * The left sidebar is a single rail with mutually exclusive tabs
 * (conversations/agents/skills) — after building an agent, the "agents" tab
 * is left active, so the conversation list (and its "Conversation Menu
 * Options" button) never rendered at all, which is why this used to hang
 * until the outer test timeout killed it. Check for an already-present
 * conversation item first, and only click the conversations tab if none is
 * found — clicking an already-active nav-panel icon collapses the sidebar
 * instead of no-opping (see NavIconButton's handleClick in
 * ExpandedPanel.tsx), so blindly clicking based on aria-pressed can break the
 * flow. Every step gets its own short timeout so a real hang fails fast at
 * the exact stuck line with an intact trace, instead of silently burning the
 * whole test's timeout budget.
 */
export async function deleteCurrentConversation(page: Page) {
  const conversationsTab = page.getByTestId('nav-panel-conversations');
  const conversation = page.getByTestId('convo-item').first();
  const conversationsActive = (await conversationsTab.getAttribute('aria-pressed')) === 'true';
  const sidebarExpanded = (await page.getByTestId('close-sidebar-button').count()) > 0;
  if (!conversationsActive || !sidebarExpanded) {
    await conversationsTab.click({ timeout: 10000 });
  }

  await conversation.hover({ timeout: 10000 });
  await conversation
    .getByRole('button', { name: 'Conversation Menu Options' })
    .click({ timeout: 10000 });
  await page.getByRole('menuitem', { name: 'Delete' }).click({ timeout: 10000 });
  await page.getByRole('button', { name: 'Delete' }).click({ timeout: 15000 });
}
