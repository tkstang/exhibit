import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const domains = ['core', 'commands', 'artifacts', 'render', 'security', 'storage', 'state'];
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      domains.map((domain) => [`#${domain}`, fileURLToPath(new URL(`./src/${domain}`, import.meta.url))]),
    ),
  },
  test: { include: ['src/**/*.test.ts'], globals: false, testTimeout: 20_000 },
});
