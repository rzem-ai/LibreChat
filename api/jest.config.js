const { maxWorkers } = require('../config/jest.workers.cjs');

const esModules = [
  'openid-client',
  'oauth4webapi',
  'jose',
  '@langchain/langgraph',
  '@langchain/langgraph-checkpoint',
  '@langchain/langgraph-sdk',
  '@mistralai/mistralai',
  'uuid',
  'sanitize-html',
  'htmlparser2',
  'domhandler',
  'domelementtype',
  'domutils',
  'dom-serializer',
  'entities',
  // micromark renders research report emails inside @librechat/researcher
  'micromark[^/]*',
  'decode-named-character-reference',
  'character-entities[^/]*',
  'devlop',
].join('|');

module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  maxWorkers,
  testTimeout: 30000, // 30 seconds timeout for all tests
  setupFiles: ['./test/jestSetup.js', './test/__mocks__/logger.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          // Required to parse TypeScript files loaded via jest.requireActual from
          // packages/ (e.g. packages/api/src/tutorial/tutorialState.ts).
          ['@babel/preset-typescript'],
        ],
      },
    ],
  },
  transformIgnorePatterns: [`/node_modules/(?!(${esModules})/).*/`],
};
