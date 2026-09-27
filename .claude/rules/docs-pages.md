---
paths:
  - docs/**/*.md
---

# Documentation Pages

Everything under `docs/` ships in the npm package and is checked by
[docs.ts](../../tools/verification/docs.ts) through `pnpm docs:check`, which runs inside
`pnpm lint` and the pre-commit hook. Authoring guidance:
[Documentation authoring](../../docs/engineering/development.md#documentation-authoring).

## Conventions

- Every page starts with YAML frontmatter containing non-empty `title:` and `description:`,
  then a `# Title` heading and prose.
- Every directory has an `index.md` with the same frontmatter and a `## Contents` section whose
  bullet list links each immediate `.md` page and each child directory's `index.md`.
- Links are relative paths with the `.md` extension and must resolve on disk from the linking
  file; external links use full URLs.
- Any `docs/<path>.md` path mentioned in a tracked `.md`, `.ts`, or `.mjs` file must exist.
- Placement: consumer and operator content in `docs/user-guide/`; implementation,
  contribution, verification, and release process in `docs/engineering/`.
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
- Verify with `pnpm docs:check` and `pnpm format` (oxfmt formats Markdown under `docs/`).

<!-- OAT-managed: do not edit directly. Source: .agents/rules/docs-pages.md -->
