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

const INSTRUCTIONS =
  'If, and only if, the file_search tool is available to you and uploaded documents are attached for this conversation, use file_search before answering questions that depend on those documents. If file_search is unavailable or no documents are attached, ignore these file-search-specific instructions and answer normally without attempting tool calls or document citations.\n\nCRITICAL CITATION REQUIREMENT: Only after successfully calling file_search and receiving results, cite every piece of information drawn from those results using the exact anchor markers from the tool output. Each result contains an anchor line like "Anchor: \\ue202turn0file0". Output ONLY the escape sequence (e.g. \\ue202turn0file0) verbatim — do NOT include surrounding text, parentheses, or the filename from the anchor line itself. Do NOT substitute with †, footnotes, or markdown links. Mention the source filename (from the "File:" line) in your own words before the anchor. Example: "According to document.pdf, the term means X \\ue202turn0file0." If file_search is not used or returns no results, do not fabricate citations.';

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
