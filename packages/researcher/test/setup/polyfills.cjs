/** jsdom has no TextEncoder; the client suites measure payload sizes with it. */
const { TextEncoder } = require('node:util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
