---
title: 'Install and verify Exhibit'
description: 'Check an existing CLI or install from an explicitly approved source checkout.'
---

# Install and verify Exhibit

Use Node 24 and pnpm 11.8.0 for source installation. `exhibit` and `xbt` are
aliases for the same CLI. A request to share a document does not authorize
installation, PATH changes, infrastructure changes, or a cloud write/delete probe.

## Check availability first

From the external project directory where you intend to use Exhibit, run these
read-only checks in order:

```bash
exhibit --version --json
xbt --version --json
```

Parse stdout as one JSON object; require exit status zero, `schema_version: 1`,
`ok: true`, `command: "version"`, and a nonempty `data.version`. These checks do
not require configuration or contact storage. Distinguish a missing command from
an installed command that fails or returns invalid output. If neither command is
available, stop and request installation authorization. If an installed command
is broken, invalid, or the aliases disagree, stop and resolve that installation;
do not silently install or upgrade it. One verified alias is enough to proceed
when the other is simply absent.

Choose the verified executable and inspect its supported flags before using it:

```bash
exhibit --help --json
```

Substitute `xbt` if that is the chosen executable. Require the same successful
envelope with `command: "help"`; read `data.help` to confirm the commands and
flags you need. Do not infer support from another checkout's documentation.

## Install only with authorization

The source package is `@tkstang/exhibit` with `private: true`; these instructions
do not claim an npm release. The repository
[tkstang/exhibit](https://github.com/tkstang/exhibit) is private. Obtain an explicit
user-approved local checkout and revision before building. Do not automatically
clone the repository, fetch a revision, or substitute an unapproved download.

Verify Node and pnpm versions and the approved checkout/revision. From that
approved repository root, run only after installation approval:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm add -g .
```

Use `pnpm add -g .` with pnpm 11, not `pnpm link --global`. Dependency installation
can run repository lifecycle scripts, including local Git hook setup. If the
toolchain is missing or incompatible, obtain approval to install or change it.
If pnpm's global binary directory is unavailable, stop and review the required
PATH/shell changes. Run `pnpm setup` or edit shell configuration only with
deliberate approval.

Return to the original external project directory and repeat both version checks
and the chosen executable's help check. A command working only inside the source
checkout does not establish that the installed CLI is usable elsewhere.

## Continue with configuration

After CLI verification and once the intended config, credentials, and storage
target are known, the read-only connection check is:

```bash
exhibit --config /absolute/path/to/exhibit-config.json doctor --json
```

Use the chosen executable. This performs signed storage listing; it is not a
purely local availability check. `doctor --probe` additionally writes, fetches,
tests conditional operations, and deletes a temporary object, so it requires
separate intentional authorization.

If the `exhibit-setup` skill is unavailable, follow this bundled installation
guide directly; skill discovery is not an installation prerequisite. Everyday
CLI setup does not require engineering verification documents, browser-test
installation, or running source-quality CI. Those contributor checks are distinct
from verifying the local executable and its configured connection.
