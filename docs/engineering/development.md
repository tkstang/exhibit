---
title: 'Development and release'
description: 'Run local checks, use worktrees and hooks, and prepare an intentional release.'
---

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

## Installed toolchain

The committed lockfile was resolved with Node 24.18.0 and pnpm 11.8.0 on the Mini.
CI uses `pnpm install --frozen-lockfile` unconditionally. StatiCrypt 3.5.4 and AWS
SDK 3.1135.0 resolved without changing their pins. The explicit SDK pin is the only
minimum-release-age exception; esbuild is the only allowed dependency build script.
Strict release-age handling prevents automatic future exceptions.

Oxfmt has been run on the imported sources. OAT-generated files and managed
`AGENTS.md` blocks are excluded so formatting cannot invalidate OAT's exact markers.
The original delivery's `MANIFEST.sha256` is historical provenance for the laptop
archive, not a checksum list for the subsequently edited Git tree.

pnpm 11 uses `pnpm add -g .` to register local binaries; see the
[pnpm migration note](https://pnpm.io/11.x/cli/link). Both installed binaries were
exercised locally. `pnpm test:package` packs into temporary storage, rejects state
and provider caches, checks resources, and renders an encrypted viewer from the
extracted package using the installed dependencies.

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

## Worktrees and Git hooks

Use Node 24, then run `pnpm worktree:init` in the new checkout. It copies missing
root-local environment/provider config from the main worktree without overwriting
destination files, installs frozen dependencies, configures hooks, builds, and uses
`oat local sync` plus project-only `oat sync` when OAT is available. The OAT config
owns which local project paths are synchronized. Exhibit user config and password
receipts are never copied by this bootstrap.

Archive downloads are opt-in: `SYNC_S3_ARCHIVES=1 pnpm worktree:init`.
`SKIP_S3_ARCHIVE_SYNC=1` takes precedence. Normal initialization performs no cloud
probe or publication. Install Chromium separately with `pnpm exec playwright install chromium`.

`pnpm worktree:validate` requires a clean tree and runs `check`, HTTP browser tests,
and package verification, then checks cleanliness again.

The pre-commit hook runs lint, typecheck, and formatting checks without modifying
files. The commit-msg hook enforces Conventional Commits. `GIT_HOOKS=0` is an explicit
escape hatch; the full validation remains required before handoff.

`AGENTS.md` and its `CLAUDE.md` include are present. Product skills under `src/skills/`
are independent of any OAT development workflow. Run your normal `oat init` locally
if you want OAT development skills; the archive does not pre-create lifecycle trees.

`prepare` installs hooks only when the package root has its own `.git` directory or
file, supporting linked worktrees without changing an ancestor repository. It
reports configuration failures. After `git init`, run `pnpm prepare` deliberately.

## Skill bundles

Edit `src/skills/<name>/SKILL.md` and its supporting files, not the generated
`skills/` or `plugins/exhibit/` copies. Edit plugin manifests under `src/plugin/`.
The shared installation guide lives in `docs/user-guide/installation.md`; the
builder copies it into each skill and rewrites its source link to the bundled
reference. Other skill references must stay within that skill's directory.
Use Markdown links and images rather than raw HTML. Bundles allow web/email links
but reject filesystem URLs and other URL schemes.

```bash
pnpm skills:build
pnpm skills:check
pnpm test:skills
```

Commit source and generated outputs together. The builder rejects symlinks and
missing/escaping references, validates inputs before updating outputs, and removes
obsolete files only inside its generated destinations. `skills:check` is read-only
and fails on drift; both lint/CI and npm prepack require it. Bundle tests relocate
each skill to an unrelated temporary directory and check its local references.
They do not claim an actual provider-host installation or live publication.

## Documentation authoring

Keep consumer instructions under `docs/user-guide/` and implementation/contribution
guidance under `docs/engineering/`. Use plain `.md` unless a future site needs an
interactive component. Each page has `title` and `description` frontmatter; each
directory has an `index.md` with a `## Contents` list linking its immediate pages
and child indexes. Use relative links with `.md` extensions.

When moving a page, update links, CLI diagnostic paths, packaged skills, and
package checks in the same change. `pnpm docs:check` validates local links, page
metadata, navigation coverage, and docs paths in source/skills. Keep historical
session reports in Git history or repository records, not the product docs.
This structure can support a future Fumadocs site; no site runtime is installed.

## Deliberate npm release

Opening or merging a source PR does not publish the package or qualify a hosting
deployment. Before source merge, require review and green PR CI, which runs the
strict checks, HTTP browser suite, package verification, and reference Terraform
validation. Keep `private: true` until a separate npm release is approved. Track
live provider and route qualification in `docs/engineering/verification.md`; complete the
[delivery-path checks](../user-guide/deployment/cloudfront.md#verify-each-delivery-path) before relying on
the work deployment for sensitive content.

Review the implementation/security checks and dependency licenses; commit a genuine
lockfile; set `private: false` only when release is approved. Verify `pnpm pack`
contains `dist`, `assets`, docs, skills, examples, and licenses, but no secrets,
receipts, or build caches. Use your reviewed trusted-publishing workflow; no npm
credentials or speculative publish action is supplied in this initial repo.
