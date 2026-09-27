---
description: 'Vitest test conventions for src/ (it + node:assert/strict, DI fixtures, secret hygiene)'
activation: glob
globs:
  - 'src/**/*.test.ts'
  - 'src/**/*.test-support.ts'
---

# Vitest Tests Under src/

Applies to co-located unit tests and shared test helpers under `src/`. Background:
[Testing boundaries](../../docs/engineering/development.md#testing-boundaries).

## Conventions

- Vitest runs with `globals: false`: import `describe`, `it`, and only the `vi`/`afterEach` you
  use from `vitest`. Use `it(...)`, not `test(...)`.
- Assert with `node:assert/strict` (`assert.equal`, `deepEqual`, `ok`, `match`, `rejects`,
  `throws`), not `expect`. This is the repository convention; tooling does not enforce it.
- Wrap scenarios in `describe('<unit>', () => { it('<behaviour>', ...) })`; a bare `it(...)`
  is fine for a single-scenario file.
- Co-locate `src/<domain>/<name>.test.ts` beside its subject. Import the subject and siblings as
  `./name.js`, other domains through `#domain/name` maps, never `../` (`pnpm lint` rejects it).
- Shared helpers belong in `*.test-support.ts` files. Only `*.test.ts` and `*.test-support.ts`
  are excluded by `tsconfig.build.json`; any other helper file is compiled into `dist/` and ships
  to npm.
- Reuse [fixtures.test-support.ts](../../src/core/fixtures.test-support.ts) through
  `#core/fixtures.test-support`: `config`, `date`, `s3Error()`, `MemoryTransport`, `memory()`
  (returns `{ transport, store, state, receipts }`), and `object()`.
- Never use `console.*` in tests; it is a lint error.

## Patterns

- Prefer dependency injection over module mocks: build a `*Dependencies` object
  (`PublishDependencies`, `RuntimeDependencies`, `ReceiptDependencies`) or pass `memory()`'s
  transport. Reserve `vi.mock` for OS seams with no injection point, as
  `src/core/files-durability.test.ts` does for `node:fs/promises`.
- Environment: `vi.stubEnv(...)` with `afterEach(() => vi.unstubAllEnvs())`, using obviously fake
  `exhibit-fixture-*` credentials. For SDK-level behaviour, start a loopback `node:http` server
  and point `config.storage.endpoint` at it with `forcePathStyle: true`.
- Filesystem: `mkdtemp(join(tmpdir(), 'exhibit-<area>-'))`, cleaned up with
  `rm(dir, { recursive: true, force: true })` in `finally`. Guard POSIX mode assertions with
  `process.platform !== 'win32'` or `it.skipIf(process.platform === 'win32')`.
- Secrets: for every password, token, path, or title input, assert it does not leak, e.g.
  `assert.equal(JSON.stringify(result).includes(secret), false)`. Name fixture secrets with
  `fixture`, `sentinel`, or `private` so they are never mistaken for real values.
- Failures: assert the stable code, not the message:
  `await assert.rejects(promise, { code: 'E_CONFLICT' })`.
- Crypto tests use the real pinned StatiCrypt through `createProtector()`, never a fake cipher.
- Run one file with `pnpm exec vitest run src/<domain>/<name>.test.ts`, then `pnpm lint` before
  committing. The default test timeout is 20 seconds.
