---
description: 'Documentation page contract enforced by pnpm docs:check and oat docs check (frontmatter, index Contents, resolving links)'
activation: glob
globs:
  - 'docs/**/*.md'
---

# Documentation Pages

Everything under `docs/` ships in the npm package and is checked by
[docs.ts](../../tools/verification/docs.ts) through `pnpm docs:check`, which runs inside
`pnpm lint` and the pre-commit hook. CI also runs `pnpm exec oat docs check --target-dir docs`
(pinned OAT CLI); it must report 0 errors. Authoring guidance:
[Documentation authoring](../../docs/engineering/development.md#documentation-authoring).

## Conventions

- Every page starts with YAML frontmatter containing non-empty `title:` and `description:`,
  then a `# Title` heading and prose. Keep each description 40–160 characters and grounded in
  the page content.
- Every directory has an `index.md` with the same frontmatter and a `## Contents` section whose
  bullet list links each immediate `.md` page and each child directory's `index.md`. Past 10
  entries, group the list under meaningful `###` headings with at most 10 links each.
- Links are relative paths with the `.md` extension and must resolve on disk from the linking
  file; external links use full URLs.
- Any `docs/<path>.md` path mentioned in a tracked `.md`, `.ts`, or `.mjs` file must exist.
- Placement: consumer and operator content in `docs/user-guide/`; implementation,
  contribution, verification, and release process in `docs/engineering/`; `docs/contributing.md`
  is the docs-about-docs entry. This Consumer and Maintainer IA is recorded in
  `.oat/repo/reference/decisions/DR-261025-documentation-information.md`.
- Plain Markdown only: no MDX, site components, or HTML.
- Never place `AGENTS.md`, `CLAUDE.md`, `README.md`, notes, or other non-page files under `docs/`;
  the check treats them as pages and they would ship to npm. Keep dated session reports, review
  logs, and handoffs out of product docs.

## Patterns

- Adding a page: create it with frontmatter and link it from the parent `index.md`
  `## Contents` list in the same commit.
- Adding a directory: create its `index.md` first, link it from the parent index, then add pages.
- Moving or renaming a page: update every link, every `docs/<path>.md` mention in `src/` (CLI hints
  in `src/core/errors.ts`) and `tools/`, and `user-guide/<path>.md` paths in `src/skills/**`, then
  run `pnpm docs:check`.
- Verify with `pnpm docs:check`, `pnpm exec oat docs check --target-dir docs`, and `pnpm format`
  (oxfmt formats Markdown under `docs/`).
