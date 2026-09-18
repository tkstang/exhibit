# Verification report

**Initial source delivery, 2026-09-17.** This report records executed checks, not
an assertion that every requested tool was available or that AWS was deployed.

## Passed in the creation environment

| Check                              | Result                                   | Boundary                                                                                                                               |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime unit/contract tests        | **85 / 85 passed**, 16 source test files | TypeScript transpiled in a separate harness; only `vitest` describe/it imports mapped to Node's test runner                            |
| Source transpilation/syntax        | No TypeScript syntax diagnostics         | Installed TypeScript 5.8.3, not the target TS7 toolchain                                                                               |
| Partial strict type check          | Passed                                   | Internal source/tests checked using available Node typings; three external-dependency boundaries excluded as described below           |
| StatiCrypt round trips             | Passed                                   | Actual upstream engine/codec, not a toy or rewritten cipher                                                                            |
| Wrong-password and tamper checks   | Passed                                   | Actual upstream codec; ciphertext modification and incorrect password rejected                                                         |
| Embedded browser-source branch     | Passed                                   | Generated browser engine/codec executed in a Node VM with WebCrypto and no Node `require` global                                       |
| Chromium in-memory viewer checks   | **8 / 8 passed**                         | Public rendering, interaction, opaque iframe, meta-CSP network violation, toolbar, insecure-context refusal, mobile gate, viewport fit |
| Spawned executable protocol        | **6 / 6 passed**                         | Both executable names: version, help, and structured errors                                                                            |
| Infrastructure static assertions   | Passed                                   | CSP string parity, private-bucket flags, OAC/SourceArn/regional origin checks; not provider validation                                 |
| JSON/YAML/docs links               | Passed                                   | Config syntax, workflow/skill YAML, and all relative Markdown links                                                                    |
| CLI/source/package/skill contracts | Passed                                   | Named imports, no raw console output in source, shared binary entrypoint, pinned crypto, valid skill identities                        |

The runtime tests cover file confinement/permissions/UTF-8 limits, slugs/passwords,
secret redaction, storage request metadata, conditional writes/deletes, remote
pagination, local receipts, failed-write recovery, use-case branching, and CLI
errors/protocol. Source tests total **97**; the remaining 12 tests are the config
(Zod) and Markdown (Marked/sanitize-html) suites, which require installed packages.

The crypto harness used byte-identical upstream files with verified Git blob SHAs:
`db81afd43f95c49e522ad33075728eb16da8d9e7` and
`1772181fce9748e2808fde7c146b6a4f7937fe0b`. They were staged only in the temporary
verification environment. The delivered application still requires StatiCrypt
3.5.4 from its normal package install. See [sources](docs/sources.md).

The partial type check used TypeScript 5.8.3 and available Node declarations, with
`core/config.ts`, `render/markdown.ts`, and `storage/aws.ts` treated as unchecked
external-dependency boundaries in a **temporary copy only**. The delivered files
contain no such suppression. This is not a substitute for `pnpm typecheck` against
actual installed TS7/dependency declarations.

## Browser scope

Installed Chromium 144.0.7559.96 could render in-memory `set_content` pages, but
its container administrator policy blocked browser URL navigation, including
loopback/file URLs. No policy was changed to get around that restriction.

The in-memory checks confirmed an opaque srcdoc iframe, inline JavaScript,
Unicode/public rendering, an actual `connect-src` security-policy violation for
an absolute outbound URL, and the protected gate's refusal of an insecure context.
They **did not** execute the complete password-entry flow under real HTTP response
headers. That flow is implemented in the supplied Playwright test suite and must
be run locally. The Node crypto/VM checks and the Chromium DOM checks are separate
pieces of evidence, not a claimed end-to-end HTTP browser success.

## Not executed here

- A normal npm/pnpm dependency install, dependency audit, or resolved lockfile.
- Node24 / TypeScript7 / Oxc / Vitest checks with the actual installed dependencies.
- The 12 Zod/Markdown tests requiring their package implementations.
- The full five-test HTTP Playwright suite.
- Terraform fmt/init/validate/plan/apply with the AWS provider.
- Any live S3, CloudFront, Fastly, R2, MinIO, or other provider qualification.
- npm publication, GitHub pushes, IAM changes, DNS changes, or cloud deployment.

The container had Node22.16.0 and TypeScript5.8.3 but no outbound npm access, pnpm,
Oxc, Vitest, AWS JS SDK, Zod, Marked18, sanitize-html, or Terraform. Network package
installation failed. A lockfile was **not** fabricated. Oxfmt was unavailable, so
run the actual formatter before judging formatting-check failures.

## Static security review performed

The finished source was reread around upload order, state identity, conditional
operations, secret outputs, script-data escaping, artifact isolation, and the
Terraform origin policy. The review confirmed encrypted bytes are the only protected
upload, no cloud password metadata, no implicit overwrite, and no private-bucket
fallback. It also added full StatiCrypt attribution to generated protected HTML
and a browser-source-branch regression test. This was a source review within this
implementation session, **not an independent third-party security audit**.

## Required local qualification

```bash
pnpm install
pnpm format
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

Review/commit the resulting lockfile. Then:

```bash
cd examples/terraform/aws
terraform fmt
terraform init -backend=false
terraform validate
```

Only after reviewing and approving a real deployment plan should you apply it.
Use `exhibit doctor --probe --json` and a private-window manual unlock against the
resulting HTTPS CDN URL. Start with the non-sensitive examples. Do not infer
production readiness or security certification from the partial offline checks.
