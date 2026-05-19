/**
 * Startup patch: injects GLOBAL_AGENT_INSTRUCTIONS into the compiled
 * applyContextToAgent function inside packages/api/dist/index.js.
 *
 * This is needed because the container uses a pre-built image that
 * doesn't include our local source changes.
 */
const fs = require('fs');

const TARGET = '/app/packages/api/dist/index.js';
const MARKER = 'GLOBAL_AGENT_INSTRUCTIONS';

const INSTRUCTIONS = [
  'You have access to uploaded documents via the file_search tool.',
  'You MUST call file_search before answering any question — no exceptions.',
  'Never answer from memory when documents are available.',
  '',
  'CRITICAL CITATION REQUIREMENT: After calling file_search, you MUST cite every',
  'piece of information using the exact anchor markers from the tool results.',
  'Each result contains an anchor line like "Anchor: \\ue202turn0file0 (filename.pdf)".',
  'You MUST output these escape sequences VERBATIM immediately after each statement',
  'derived from that result. Do NOT substitute with †, footnotes, or markdown links.',
  'Always mention the source filename before the anchor.',
  'Example: "According to document.pdf, the term means X \\ue202turn0file0."',
  'Never omit citations.',
].join(' ');

try {
  let code = fs.readFileSync(TARGET, 'utf8');

  if (code.includes(MARKER)) {
    console.log('[patch-agent-instructions] Already patched, skipping.');
    process.exit(0);
  }

  // The compiled code has: const baseInstructions = agent.instructions || '';
  // Replace with: const baseInstructions = [GLOBAL_AGENT_INSTRUCTIONS, agent.instructions].filter(Boolean).join('\n\n');
  const oldPattern = "const baseInstructions = agent.instructions || '';";
  const newCode = `const ${MARKER} = ${JSON.stringify(INSTRUCTIONS)};\n    const baseInstructions = [${MARKER}, agent.instructions].filter(Boolean).join('\\n\\n');`;

  if (!code.includes(oldPattern)) {
    console.error('[patch-agent-instructions] Could not find target pattern in', TARGET);
    console.error('[patch-agent-instructions] Pattern:', oldPattern);
    process.exit(0); // Don't block startup
  }

  code = code.replace(oldPattern, newCode);
  fs.writeFileSync(TARGET, code);
  console.log('[patch-agent-instructions] Successfully patched applyContextToAgent');
} catch (err) {
  console.error('[patch-agent-instructions] Error:', err.message);
  // Don't block startup
  process.exit(0);
}
