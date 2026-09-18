# Development and release

## Toolchain

Node 24, pnpm 11.8.0, TypeScript 7, Oxc, Vitest 4, and Playwright. Runtime modules
are ESM. The SDK and crypto pins are deliberate; see `package.json` and the adapter
contract test before upgrading them.

```bash
pnpm install
pnpm format
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm check` combines the main checks. Browser tests are separate because they need
a browser installation. `pnpm preview` builds and serves only local example pages;
it does not touch AWS. `pnpm dev -- --help` may vary in argument forwarding between
package-manager versions; the unambiguous source command is
`pnpm exec tsx src/cli.ts --help`.

## Initial archive and lockfile

The creation environment lacked outbound npm access and the requested installed
toolchain. A lockfile was not invented. The first local install must resolve actual
packages, then the lockfile must be reviewed and committed. CI includes a clearly
marked bootstrap path when no lockfile exists; after that first commit, remove the
bootstrap branch and enforce `--frozen-lockfile` unconditionally before release.

Oxfmt could not run in the generation environment. Run `pnpm format` first and
inspect its diff. Full compiler/linter/real dependency/browser/Terraform checks must
then run without treating the offline fallback checks as substitutes.

## Testing boundaries

Unit tests use Vitest's `describe`/`it` and Node assertions, with co-located test files.
Storage tests inject a transport that records real SDK request shapes and simulates
conditional operations. Use-case tests inject storage/render/state seams. Separate
StatiCrypt tests use the actual upstream implementation, not a custom fake cipher.

Playwright tests start a loopback HTTP server with production-like CSP/security
headers and inspect the real browser viewer. They cover wrong passwords, tampering,
Unicode, inline interactivity, opaque-origin isolation, blocked network, locking,
and public mode. A live HTTPS/S3/CDN test is still required for infrastructure
qualification; neither local test type contacts AWS.

## Source layout

`commands/` owns command orchestration; `artifacts/` the publication/lifecycle use
cases; `render/` presentation; `security/` scanning/passwords/crypto; `storage/`
the provider boundary; `state/` local receipts; `core/` contracts and file/config
helpers. `assets/` must be included in the published package. Runtime import maps
point to `dist`, and source/test aliases mirror the same named domains.

`tools/check-build.mjs` checks both executable names, emitted library declarations,
assets, and a spawned version JSON response. `tools/check-contracts.mjs` checks
source import/console conventions and skill identities. Tests/test-support files
are excluded from release build output.

## Infrastructure checks

```bash
cd examples/terraform/aws
terraform fmt -check
terraform init -backend=false
terraform validate
```

Use an explicitly reviewed account/workspace and plan before any apply. The example
creates resources and can incur charges. Nothing in `pnpm check` deploys anything.

## Agent setup and Git hooks

`AGENTS.md` and its `CLAUDE.md` include are present. Product skills under `skills/`
are independent of any OAT development workflow. Run your normal `oat init` locally
if you want OAT development skills; the archive does not pre-create lifecycle trees.

`prepare` installs the local conventional-commit hook only when this directory has
its own `.git`. It does not mutate a parent repository's hook configuration. After
`git init`, run `pnpm prepare` deliberately. There is no .git history in the ZIP.

## Deliberate npm release

Review the implementation/security checks and dependency licenses; commit a genuine
lockfile; set `private: false` only when release is approved. Verify `pnpm pack`
contains `dist`, `assets`, docs, skills, examples, and licenses, but no secrets,
receipts, or build caches. Use your reviewed trusted-publishing workflow; no npm
credentials or speculative publish action is supplied in this initial repo.
