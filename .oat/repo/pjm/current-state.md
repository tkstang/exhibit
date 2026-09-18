# OAT Current State

This file is the active operating picture and lives under `pjm/` (the
operational layer), not `reference/`. To reduce cross-worktree conflicts, keep
edits append-mostly and scoped to the section you own; avoid rewriting whole
sections another branch may also touch.

## Canonical References

- [Verification](../../../VERIFICATION.md): current installed-toolchain results and remaining boundaries.
- [Deployment context](../reference/research/initial-deployment.md): selected public-directory-only direction and historical alternatives.
- [Split-DNS example](../../../docs/cloudfront.md#split-dns-delivery-example): public/VPN mappings, security headers, and acceptance checks.
- [Product decisions](../../../docs/decisions.md): initial implementation constraints.

<!-- List durable repo references, source-of-truth docs, dashboards, or processes here.
Decisions live in reference/decisions/ (one file per record); link them rather than
copying their content here. -->

## What's Implemented

- Initial source imported from the laptop and committed on `mvp`; upstream archive checksums verified.
- Node 24 / pnpm 11 install, real lockfile, strict build, unit tests, desktop/mobile HTTP browser tests, and package verification.
- Revision-specific receipt cleanup and non-symlink private state-directory checks.
- Git hooks, worktree bootstrap/validation, and OAT archive settings aligned with existing personal repositories.
- Reference Terraform initialized and validated locally; both CLI binary names installed on the Mini.
- Directory-scoped publication/list/removal, explicit `--no-encrypt`, and organization wrapper/branding examples.
- The `mvp` branch is pushed. Current local checks pass with 110 unit tests, 12 HTTP browser tests, and a 100-file package check.

<!-- Summarize shipped capabilities and important repo conventions here. -->

## What's Next

The selected first work target is the existing OAT bucket with a dedicated
`exhibits.voxops.net` hostname and `exhibits/` prefix. All routes are gated except
`/public/` descendants; encryption remains independently enabled by default.
The owning infrastructure change is [Terraform PR #1841](https://github.com/voxmedia/terraform/pull/1841).
Its deployment and route/header qualification are not established by Exhibit tests.

Review the initial Exhibit PR, then merge after green PR CI. npm release
remains separate and the package stays private. Live S3/CDN qualification, Windows
ACL qualification, and the personal hosting target remain pending. Foundations
improvements were submitted in PR #1; their merge status is not tracked here.

<!-- Track near-term follow-up work, known gaps, and active handoff context here.
Track concrete items in pjm/backlog/ and sequencing in pjm/roadmap.md; keep this
section to a short narrative pointer. -->
