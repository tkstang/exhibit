# OAT Current State

This file is the active operating picture and lives under `pjm/` (the
operational layer), not `reference/`. To reduce cross-worktree conflicts, keep
edits append-mostly and scoped to the section you own; avoid rewriting whole
sections another branch may also touch.

## Canonical References

- [Verification](../../../VERIFICATION.md): current installed-toolchain results and remaining boundaries.
- [Deployment proposal](../reference/research/initial-deployment.md): public encrypted routes and VPN-or-Basic-Auth `/internal/` routes.
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

<!-- Summarize shipped capabilities and important repo conventions here. -->

## What's Next

Review the deployment proposal and select work/personal targets and hostname. The
owning Vox infrastructure needs a reviewed adaptation plan before any apply.
Live S3/CDN qualification and Windows ACL qualification remain unexecuted. Exhibit
has not been pushed or published. Foundations improvements are in PR #1.

<!-- Track near-term follow-up work, known gaps, and active handoff context here.
Track concrete items in pjm/backlog/ and sequencing in pjm/roadmap.md; keep this
section to a short narrative pointer. -->
