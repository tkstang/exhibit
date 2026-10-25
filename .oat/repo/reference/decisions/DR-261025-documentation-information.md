---
id: DR-261025-documentation-information
title: "Documentation information architecture: Consumer and Maintainer"
date: 2026-10-25
status: accepted
legacy_id: null
---

# Documentation information architecture: Consumer and Maintainer

## Context

Exhibit ships docs/ in its npm package as plain Markdown checked by pnpm docs:check. The existing tree already separates two reader contexts: people who install, configure, publish with, deploy, and recover Exhibit (docs/user-guide/, including agents/ and deployment/ subsections), and people who change, verify, and release it (docs/engineering/). Adopting OAT Markdown docs tooling 0.3.33 asks the repository to record the IA it already uses.

## Decision

Record the existing structure as the Consumer and Maintainer preset (consumer-maintainer) without moving pages. Track docs/user-guide/ serves consumers and operators, organized by task (getting started, installation, configuration, CLI reference, security, recovery, troubleshooting) with agents/ and deployment/ subsections. Track docs/engineering/ serves maintainers with architecture, development, verification, releases, decisions, and sources. docs/contributing.md is the docs-about-docs entry under the root index. No independent QA track exists, so the verification overlay is none. The shared config documentation.ia mirrors this record; this record is authoritative.

## Consequences

New consumer or operator pages go under docs/user-guide/; implementation, contribution, verification, and release pages go under docs/engineering/. Each directory keeps an index.md whose Contents links every immediate page and child index, enforced by pnpm docs:check and oat docs check --target-dir docs. Changing tracks or moving pages requires a new decision and link updates, because docs paths are shipped in the npm package and referenced from CLI diagnostics and packaged skills.
