# Repository Tools

Scripts under `tools/` build, verify, package, and release Exhibit. They extend the root
[AGENTS.md](../AGENTS.md); the ownership overview lives in
[Repository tools](../docs/engineering/development.md#repository-tools).

## Execution model

- Node 24 runs these TypeScript modules directly (type stripping): `node tools/<area>/<file>.ts`.
  There is no build step, no `dist/` output, and no `tsx`.
- `tsconfig.tools.json` sets `allowImportingTsExtensions` and `erasableSyntaxOnly`, so use only
  erasable syntax: no `enum`, `namespace`, constructor parameter properties, or decorators; use
  `import type` for type-only imports. `pnpm typecheck` covers `tools/` through this config.
- Import sibling tool modules with explicit `.ts` extensions (`./contracts.ts`), not `.js`.
- Exception to the root no-parent-imports rule: a tool that must inspect current application
  source imports it as `../../src/<domain>/<file>.ts`. `#domain/*` maps resolve to `dist/` at
  runtime and may be stale or missing before `pnpm build`. Mark the import with a short
  "Tooling exception" comment, as `verification/contracts.ts` does.
- Layout by concern: `verification/` (build, contracts, docs, runtime, terraform), `packaging/`
  (skill bundles, npm archive), `release/` (metadata, changelog, prepare, publish, archive),
  `git-hooks/`, `preview/`. Add new scripts to the matching area.
- JavaScript exceptions: `git-hooks/install.mjs` stays dependency-free because it runs in
  `prepare` before `node_modules` exists; `preview/server.mjs` runs after `pnpm build`.

## Output and failure

- `no-console` is a lint error here too: write with `process.stdout.write` (one summary line on
  success) and `process.stderr.write` (human guidance on failure).
- Fail by throwing from `node:assert/strict` or by setting `process.exitCode = 1`.
- Scripts that spawn external tools use `spawnSync`/`execFileSync` with explicit arguments and
  print install guidance when the binary is missing (see `verification/terraform.ts`).

## Tests

- Tool tests are co-located `*.test.ts` files using `node:test` (`test()`, `TestContext.after`
  for cleanup) and `node:assert/strict`. Vitest only collects `src/**/*.test.ts`, so
  `pnpm test` never runs them and Vitest imports here are never executed.
- Run them with `pnpm test:skills` and `pnpm test:release` (both run inside `pnpm check`). Add
  a paired test file only for non-trivial logic, and give it a script.

## Adding a check

1. Create `tools/<area>/<name>.ts` following the rules above.
2. Add a `package.json` script (`node tools/<area>/<name>.ts`) and wire it into `check` or
   `lint` in the same change; add it to `.github/workflows/ci.yml` if it needs extra toolchain.
   An unwired check is silently unenforced.
3. Run `pnpm typecheck && pnpm lint` and the relevant test script.

See [Toolchain](../docs/engineering/development.md#toolchain) for the full command list.
