import path from 'node:path';
import { fileURLToPath } from 'node:url';
import root from '../../eslint.config.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default root.map((config) => ({ basePath: repo, ...config }));
