---
title: Verification and support boundaries
description: Reproduce local checks and distinguish tested behavior from deployment qualification.
---

# Verification and support boundaries

## Tested baseline

The installed-toolchain baseline was checked on macOS arm64 with Node 24.18.0
and pnpm 11.8.0 on 2026-09-18. Local checks passed for strict types, lint/contracts,
formatting, build, 185 Vitest tests in 25 files, and 74 real HTTP Chromium tests.
Package verification checks the packed resources, both binary entrypoints, and
an encrypted viewer rendered from the extracted package.

Eight additional Node tests check skill bundle parity, isolated relocation,
reference closure, stale-output detection, symlink refusal, and setup contract
details. Package verification also checks every standalone/plugin bundle byte
against its source-derived output and relocates each packed skill independently.
These checks do not establish installation or discovery in a live agent host.

Eleven Node release tests cover metadata/tag checks, changelog extraction, archive
and notes integrity, registry error handling, and real temporary Git histories.
Local release dry runs also install the actual archive with npm outside the source
checkout and verify both executable aliases. New versions receive a non-publishing
npm dry run; existing-version recovery checks registry integrity instead.
Live npm OIDC publication and GitHub Release creation remain unverified.

The browser suite uses desktop and mobile viewport sizes. It covers correct/wrong
passwords, tampering, source isolation, blocked network access, inline HTML
interaction, fragment navigation in Markdown and HTML, header and meta-only CSP,
lock/reload, plaintext mode, and layout. Meta-only CSP does not prevent embedding
the outer viewer; anti-framing requires delivery headers. Mobile Chromium viewport
coverage is not native Safari or Android qualification.

SDK tests exercise conditional PUT/DELETE against a loopback HTTP fixture. Crypto
tests use actual pinned StatiCrypt, not a substitute cipher. These checks do not
contact a live storage provider. A signed SDK HTTP fixture checks HEAD 403 followed
by an exact-key-prefix listing and create-only PUT. Reference Terraform formatting,
backend-disabled/read-only initialization, validation, and 17 mocked tests passed
locally; no apply or deployment acceptance is implied. The lockfile includes
macOS arm64 and Linux amd64 provider hashes; existing registry ZIP hashes already
covered multiple platforms, so the review's claim of inevitable Linux lockfile
mutation was not reproduced.

## Reproduce the checks

Use the version in `.nvmrc` and the package manager pinned in `package.json`.
From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:browser
pnpm test:package
```

For the reference infrastructure:

```bash
cd examples/terraform/aws
terraform fmt -check -recursive
terraform init -backend=false -lockfile=readonly -input=false
terraform validate
terraform test
```

`pnpm terraform:check` runs those same reference-infrastructure checks from the
repository root. `pnpm lint:workflows` runs actionlint 1.7.12 through Go; it requires
Go and access to its module proxy on the first run. This pinned check passed locally
on 2026-09-18. PR #2 CI (`verify`, `terraform`, and the release dry run) first ran
these pinned workflow, Go, and Terraform steps on Linux on 2026-09-19 at `b5324a1`
and passed.

`pnpm worktree:validate` runs the application, browser, package, Terraform, and
workflow-lint gates and requires a clean tree before and after. `pnpm check` remains
the Node-only application gate. PR CI runs the same Terraform and workflow checks
on Linux. Check the actual PR status rather than treating a
local result as a CI result. See [development](development.md).

## Not yet qualified

- Live S3/CDN/DNS delivery, VPN/Basic Auth rules, alternate-route bypasses, and
  response-header parity on the target deployment.
- Authorized non-sensitive publication and active probes, with confirmed cleanup
  and browser checks on both public and VPN paths.
- The prefix-scoped publisher policy with real S3: qualify a fresh slug using only
  that policy, then verify overwrite/conflict/removal. Missing-key HEAD 403 is
  handled by a successful exact-prefix list; denied/incomplete listings or an
  existing unreadable object still fail closed. No bucket-wide list grant or
  unconditional write fallback was introduced. This remains a release checkpoint.
- Windows ACL/junction behavior and native-device browsers.
- Power-loss durability and adversarial filesystem changes by the same local user.

File I/O tests verify file sync before rename/link and parent-directory sync after
it. Directory sync is skipped on Windows and unsupported filesystems; unexpected
I/O errors fail the write. These ordering checks are not power-cut testing.
Syncing an ancestor that Exhibit does not own tolerates symlink/access limitations;
the validated receipt directory still fails on unexpected sync errors after rename/link.

## September review follow-up

The local review of `ff3bfc0..8da173d` reported 3 important, 12 medium, and 19 minor
findings. All received implementation, regression-test, or documentation treatment;
the live qualification boundaries above still apply. The original review is
retained in the local review archive. Use the following map for re-review:

| Findings                | Treatment and evidence                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| I1                      | Prefix-scoped HEAD absence handling; adapter, publish-race, signed SDK HTTP tests; live S3 pending                                        |
| I2, M9                  | Fragment navigation and meta-only CSP regressions across desktop/mobile, public/protected, Markdown/HTML                                  |
| I3, m1, m15             | Verified action commit pins, Dependabot, no persisted checkout credentials, job timeouts and runtime pins; actionlint                     |
| M1, m11                 | Title/body scanning and bounded coverage across secret-rule families; unit regressions                                                    |
| M2, M3, m7, m8, m9      | JSON error intent, retained warnings, duplicate/invalid options, safe output failures; CLI and spawned-process tests                      |
| M4, m10                 | Strict base-URL delimiters and config-specific errors; config tests                                                                       |
| M5, m2, m4, m6          | Uncertain PUT response, idempotent missing-object delete, strict metadata dates, conflict recovery hint; adapter/lifecycle tests          |
| M6                      | Directory synchronization and failure handling; I/O ordering tests                                                                        |
| M7, m12, m14            | Nonempty Terraform prefixes, qualified provider hashes, bounded Terraform version and bucket names; 16 mocked tests                       |
| M8                      | Removed stale source-import checksum manifest; original retained in Git history                                                           |
| M10, M11, m13, m17, m18 | Correct receipt/secret semantics; full CLI warning/option/exit/error references; logging, HSTS and independent skill-version explanations |
| M12                     | Failing encryption makes no PUT; failed probe cleanup reports exact key; empty ETag issues no DELETE                                      |
| m5                      | Explicit local receipt inventory and exact-digest forgetting with consent; no automatic pruning or remote mutation; state and CLI tests   |
| m16                     | CSP equality enforced across runtime, Terraform, and setup skill source                                                                   |
| m19                     | `pnpm check` rejects non-24 Node; all follow-up validation uses Node 24.18.0                                                              |

### Second review follow-up

The review of `8da173d..5c9b911` reported 1 important, 6 medium, and 12 minor
findings. The following map separates fixes from documented limitations and a
disputed naming-rule claim:

| Findings   | Treatment and evidence                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1         | Symlinked ancestors and ancestor access failures no longer block private receipt writes; owned-directory sync remains strict; filesystem regressions                                                      |
| M1         | Diagnostic stderr failure does not override a delivered result; undelivered result channels still fail; CLI regressions                                                                                   |
| M2, m7     | Fragment guards cover stopped propagation, open shadow roots and SVG links; literal IDs and focus handling; HTTP browser regressions. Malformed tails and full hash-routing remain documented limitations |
| M3         | Inferred absence retains all receipts, returns `removed: false` and `W_DELETE_UNCONFIRMED`; confirmed conditional deletion remains distinct; stale-listing and doctor-cleanup regressions                 |
| M4         | Inventory remains fail-closed with static, secret-free repair guidance for stray entries and damaged receipts; filesystem/CLI tests                                                                       |
| M5         | Terraform README now matches packed test fixtures                                                                                                                                                         |
| M6         | Reproducible pinned actionlint command and CI gate; prior local actionlint evidence was a one-off, not a pre-existing CI check                                                                            |
| m1, m4, m5 | Known help topics, human receipt output, and explicit flag coupling; command tests                                                                                                                        |
| m2, m6     | Injected receipt dependencies and colocated domain tests; failure warnings retained                                                                                                                       |
| m3         | Exact Node version aligned across `.nvmrc`, CI and docs                                                                                                                                                   |
| m8, m12    | Scan only embedded titles; monotonic line counting avoids repeated prefix allocation; listed keys do not trigger redundant absence probes on denied HEADs                                                 |
| m9, m10    | Internal `E_NETWORK` documented; shared local/CI Terraform gate includes read-only lockfile initialization and mocked tests                                                                               |
| m11        | AWS explicitly reserves the entire `-an` suffix; validation retained with a regression and source link. Tooling source-import exception documented                                                        |

The viewer is still a best-effort fragment helper, not a DOM event or hash-routing
engine. Closed shadow roots, malformed tails, immediate propagation stops, late
window handlers, and cancellation listeners installed during the same dispatch
have explicit limits in the [security model](../user-guide/security-model.md).
The last case was independently reproduced during this pass and is documented,
not claimed fixed. Doctor also reports a cleanup key when HEAD only suggests the
probe is absent; a stale listing cannot certify cleanup. The exception is a probe
upload that was denied (`E_BUCKET_ACCESS` or `E_CREDENTIALS`): doctor still inspects
the slug and removes a probe left by an earlier retried attempt; when none is
visible it reports a skipped cleanup check and no key. Any other upload failure,
including a conflict, stays uncertain and keeps the key.

This project has not received an independent security audit. Read the
[security model](../user-guide/security-model.md) and
[delivery-path checklist](../user-guide/deployment/cloudfront.md#verify-each-delivery-path)
before relying on a deployment for sensitive content. A successful probe digest
does not prove browser isolation or route authentication.

Source merge, npm release, and deployment acceptance are separate decisions.
Publication-ready package metadata does not authorize publishing. Keep automation
disabled until bootstrap publication and trust setup are complete. Historical source-generation
checks and import handoffs remain in Git history; they are not current acceptance
evidence and are not shipped as operational instructions.
