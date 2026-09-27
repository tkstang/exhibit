---
paths:
  - src/skills/**
  - src/plugin/**
---

# Skill and Plugin Sources

`src/skills/` and `src/plugin/` are packaged by [skills.ts](../../tools/packaging/skills.ts);
`pnpm skills:check` runs in `pnpm lint`, the pre-commit hook, and `prepack`. Background:
[Skill bundles](../../docs/engineering/development.md#skill-bundles) and
[Agent usage](../../docs/user-guide/agents/agent-usage.md).

## Conventions

- `src/skills/` contains exactly the directories listed in `skillNames`
  (`exhibit-publish`, `exhibit-setup`) and nothing else: no `README.md`, `AGENTS.md`, or
  `.gitkeep`. Adding a skill starts with `skillNames` in `tools/packaging/skills.ts`.
- `SKILL.md` frontmatter starts with `name: <directory-name>`, then a one-line `description:`,
  `license: MIT`, and `metadata:` with `author` and a quoted SemVer `version`. The body mentions
  `exhibit`. `metadata.version` is independent of the npm package version.
- Links are inline Markdown `[text](relative/path.md#fragment)`. No raw HTML, no reference-style
  links, and no URL schemes other than `https:` and `mailto:`.
- Relative links stay inside the skill directory. The one exception is
  `../../../docs/user-guide/installation.md`, which the build copies to
  `references/installation.md` and rewrites; never create `references/installation.md` in source.
- Bundle text never references `docs/engineering`, `data.resources.docs`, or `../*.md`, and never
  shows a bare backtick `doctor` command; always prefix the binary (`xbt doctor --json`).
- Keep the tested preflight strings: `exhibit --version --json`, `xbt --version --json`,
  `--help --json`, `schema_version: 1`, `ok: true`, `command: "version"`.
- `exhibit-setup/references/deployment.md` has exactly one `Content-Security-Policy:` line,
  equal to `CONTENT_SECURITY_POLICY` in `src/security/policy.ts`.
- `src/plugin/` contains exactly `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, and
  `.cursor-plugin/plugin.json`. Every file there is parsed as JSON and must have
  `name: "exhibit"`. The build checks only `name`; keep manifest `version`s aligned with the
  skills' `metadata.version` deliberately.

## Patterns

- After any edit here, run `pnpm skills:build` and commit the regenerated `skills/` and
  `plugins/exhibit/` trees with the source change; `pnpm skills:check` fails on drift.
- Bump `metadata.version` and the three manifest `version`s when a procedure changes.
- Add supporting material as `src/skills/<skill>/references/<name>.md`, linked inline from
  `SKILL.md`.
- Change the CSP in `src/security/policy.ts` first, then `examples/terraform/aws/main.tf`, then
  the `deployment.md` header line.
- Verify with `pnpm skills:check && pnpm test:skills && pnpm lint`.

<!-- OAT-managed: do not edit directly. Source: .agents/rules/skill-bundles.md -->
