import path from 'node:path';
import { defineConfig } from 'tsdown';

/** Bundle only the package's own sources; every third-party import is a peer the host provides. */
const deps = {
  neverBundle: (id) => !id.startsWith('.') && !path.isAbsolute(id),
  onlyBundle: false,
};

export default defineConfig([
  {
    name: 'server',
    // Server: the research module and its database layer, required by the CommonJS API.
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    platform: 'node',
    dts: { oxc: true },
    outDir: 'dist',
    sourcemap: true,
    clean: false,
    checks: { circularDependency: true },
    deps,
  },
  {
    name: 'client',
    // Client: the Research and Feeds panels and their hooks, imported by the React app.
    entry: { client: 'src/client.ts' },
    format: ['esm', 'cjs'],
    platform: 'browser',
    dts: { oxc: true },
    outDir: 'dist',
    sourcemap: true,
    clean: false,
    checks: { circularDependency: true },
    fixedExtension: true,
    deps,
  },
]);
