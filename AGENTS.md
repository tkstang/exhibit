<!-- OAT project-management -->
### Project Management

- Installed project-management tools provide capability; they do not prove that this repository adopted PJM.
- Run `oat pjm doctor --json` and inspect `adoption.state` before any PJM write.
- Repository planning and durable context live under `.oat/repo/`.
- Consult it when prioritizing or planning work, checking the backlog, starting or closing tracked work, or looking for established repository context.
- Start with `.oat/repo/AGENTS.md`; it routes to `pjm/` for active state and `reference/` for durable records.
- If adoption is absent or partial, stop and initialize it with `oat pjm init`.
<!-- END OAT project-management -->

<!-- OAT decisions -->
### Decision Records

- Durable repository decisions live under `.oat/repo/reference/decisions/`; read `.oat/repo/reference/decisions/AGENTS.md` before working with them.
- Before finalizing a durable repository decision, review `.oat/repo/reference/decisions/index.md` and any relevant records.
- When the user asks to record a durable decision or confirms a proposed capture, use `oat-pjm-decision` when that skill is installed; otherwise use `oat decision new`.
- Do not hand-edit the generated decision index; run `oat decision regenerate-index` after record changes or to resolve index conflicts.
- Run `oat pjm doctor --json` and inspect `adoption.state` before any decision write.
- If the decision surface is missing, repository adoption is absent or partial; stop and initialize it with `oat pjm init`.
<!-- END OAT decisions -->
