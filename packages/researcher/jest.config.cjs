const { maxWorkers, workerIdleMemoryLimit } = require('../../config/jest.workers.cjs');

/** ESM-only packages the suites load, transformed like the package's own sources. */
const serverEsModules = [
  '@librechat/agents',
  '@librechat/code',
  '@langchain/langgraph',
  '@langchain/langgraph-checkpoint',
  '@langchain/langgraph-sdk',
  '@mistralai/mistralai',
  '@modelcontextprotocol/ext-apps',
  'uuid',
  'mdast-util-[^/]+',
  'micromark[^/]*',
  'decode-named-character-reference',
  'character-entities[^/]*',
  'devlop',
  'unist-util-[^/]+',
  'ccount',
  'longest-streak',
  'markdown-table',
  'zwitch',
  'escape-string-regexp',
  'parse-entities',
  'stringify-entities',
  'character-reference-invalid',
  'is-(?:alphanumerical|alphabetical|decimal|hexadecimal)',
].join('|');

const clientEsModules =
  'sse\\.js|@dicebear|lucide|lucide-react|morphicons|@ariakit/(react-components|react-utils|react-store|components|store|utils)|micromark.*|mdast-.*|unist-.*|decode-named-character-reference|character-.*|devlop|ccount|longest-streak|markdown-table|zwitch|escape-string-regexp|parse-entities|stringify-entities|is-.*';

const babel = (react) => [
  'babel-jest',
  {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      ...(react ? [['@babel/preset-react', { runtime: 'automatic' }]] : []),
      '@babel/preset-typescript',
    ],
  },
];

module.exports = {
  maxWorkers,
  workerIdleMemoryLimit,
  // Global only: Jest ignores testTimeout inside a project. Covers mongodb-memory-server start-up.
  testTimeout: 15000,
  projects: [
    {
      displayName: 'server',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/{server,db,contract}/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: { '\\.[cm]?[jt]sx?$': babel(false) },
      transformIgnorePatterns: [`/node_modules/(?!(${serverEsModules})/).*/`],
      setupFiles: [
        '<rootDir>/../api/jest.setup.cjs',
        '<rootDir>/../../config/jest.setup.logging.cjs',
      ],
      restoreMocks: true,
    },
    {
      displayName: 'client',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/client/**/*.spec.{ts,tsx}'],
      testEnvironment: 'jsdom',
      transform: { '\\.[cm]?[jt]sx?$': babel(true) },
      transformIgnorePatterns: [`/node_modules/(?!(${clientEsModules})/)`],
      // The component library's resolver: its ESM-only @ariakit packages need the `import` condition.
      resolver: '<rootDir>/../client/jest.resolver.cjs',
      setupFiles: ['<rootDir>/test/setup/polyfills.cjs'],
      setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'],
      restoreMocks: true,
    },
  ],
};
