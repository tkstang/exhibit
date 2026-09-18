# Local handoff for Sol

Exhibit's source implementation is present. This is the place to start after
unzipping, not a request to redesign the product or add deferred services.

## Product already decided

- Exhibit, package `@tkstang/exhibit`, two binaries `exhibit` and `xbt`, one entrypoint.
- Single-package Node24/TypeScript ESM with Foundations-style CLI, Oxc, Zod, Vitest.
- Markdown + standalone HTML, protected by default, actual pinned StatiCrypt.
- S3/S3-compatible storage. Private AWS bucket behind public CloudFront OAC reference.
- `publish`, `list`, `remove`/`rm`, `doctor`, `init`; both publishing/setup agent skills.
- No account server, database, remote MCP, collaboration, multi-file sites, expiry,
  OAT storage refactor, or speculative plugin system.

Read `AGENTS.md`, `README.md`, `VERIFICATION.md`, and `docs/decisions.md` first.

## First local pass: finish real-toolchain validation

The source-generation container could not install npm dependencies, and its browser
navigation was restricted. Its 85 passing runtime checks and 8 Chromium in-memory
checks are useful, but **not** a green full installed build. Do not report them as
97 Vitest tests or as a complete browser/cloud deployment test.

```bash
node --version                 # Use Node24.
pnpm --version                 # Intended pin: 11.8.0.
pnpm install                   # Resolve actual packages and create the genuine lockfile.
pnpm format                    # Oxfmt could not run in the creation environment.
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

Revalidate package availability, especially the explicit AWS SDK and crypto pins
and Foundations-derived tool versions. Fix any real type/lint/dependency failures
without weakening the strict configuration or replacing security behavior with
stubs. Review and commit `pnpm-lock.yaml`. Make CI's install unconditionally frozen
once the lockfile exists. `private: true` deliberately prevents accidental publish.

## Next: exercise the local UX

```bash
pnpm preview
# Public and protected sample pages on localhost:8787.
# Fixture password: exhibit-demo-password
pnpm link --global
exhibit --version --json
xbt --help
```

Confirm the encrypted gate, incorrect password, correct password, Markdown layout,
inline HTML interaction, lock/reload, and mobile viewport. Run the supplied real
HTTP Playwright suite rather than relying on in-memory rendering screenshots.

Both binaries must remain the same compiled file. Generated artifacts load package
`assets/`, so check `pnpm pack` includes assets, full crypto license, docs, skills,
and Terraform examples. Do not include `dist/` in Git even though it belongs in a
future npm package.

## Infrastructure qualification

```bash
cd examples/terraform/aws
terraform fmt
terraform init -backend=false
terraform validate
```

The user may already have S3 + Fastly. Read `docs/fastly.md` and reuse their safe
origin/signing setup rather than deploying redundant AWS infrastructure. The
Terraform example targets **new** private S3 + CloudFront resources; existing
resources require an explicit import/adaptation plan.

Ask before apply, DNS/IAM/CDN changes, npm publish, GitHub push, or destructive
cleanup. After an approved deployment, run the client against a non-sensitive
fixture and explicitly authorize `doctor --probe`. Record actual cloud results.

## Important design details to preserve

**Passwords:** generated opaque high-entropy passwords, generic gate title, local
receipts before uncertain PUTs, and no plaintext/password cloud metadata.
`--password-env`/`--password-file` are safer than a literal command-line password.
Result stdout is intentionally secret-bearing; diagnostic stderr is not.

**Storage:** create-only `IfNoneMatch`, explicit overwrite with observed `IfMatch`,
conditional exact-object deletion, and recognition of Exhibit-owned metadata. No
unconditional fallback for partially compatible S3 implementations. Use fresh random
slugs by default; explicit `.html` URLs avoid rewriting infrastructure.

**Presentation:** Marked plus sanitizer for Markdown; raw Markdown HTML escaped;
standalone HTML preserved inside an opaque-origin sandbox. CSP blocks remote
resources. Public mode embeds base64 plaintext, explicitly never described as
protection. Do not add remember-me keys or global source-origin trust casually.

**Lifecycle:** local receipts are not canonical remote state. A timeout can hide a
successful upload. A failed overwrite must not erase the previous password.
Deletion cannot revoke downloaded copies or old object versions. No fake expiry.

**Skills:** procedures find the installed canonical docs via
`exhibit --version --json` resource paths. Their file contents do not grant authority
to publish other files or apply infrastructure. Keep setup and daily publication
separate. OAT merely supplies the actual selected file path.

## Focused review targets

Inspect the pinned StatiCrypt deep-import adapter, actual Marked/sanitizer types,
real AWS conditional DeleteObject support, browser srcdoc/CSP inheritance under
HTTP headers, Windows local-state permissions, and target deployment prefix mapping.
The code is designed around those boundaries; do not treat source inspection as a
substitute for integration testing them.

## Then iterate, not expand

Once local and deployment checks are green, refine UX and add narrowly justified
regression tests. Do not introduce a second service, comments, authentication, an
MCP layer, or a monorepo just because the initial code exists. The original goal
is a small publish-and-share primitive with a useful agent interface.
