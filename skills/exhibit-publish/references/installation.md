---
title: 'Install and verify Exhibit'
description: 'Verify the CLI, install an approved package with npm or pnpm, or build from source.'
---

# Install and verify Exhibit

Use Node 24 to run Exhibit. Install a built package with npm or pnpm; building
from source uses the repository's pinned pnpm 11.8.0 toolchain.
`exhibit` and `xbt` are aliases for the same CLI. A request to share a document does not authorize
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
do not claim a registry release. Use an approved built package or an approved
checkout/revision of the private [tkstang/exhibit](https://github.com/tkstang/exhibit)
repository. Do not automatically clone, fetch, or substitute an unapproved download.

### Install a built package

Given an approved `.tgz` package produced by `pnpm pack`, choose **one** installer.
Replace the example path with the actual approved archive path.

With npm, no pnpm installation or source checkout is required:

```bash
npm install --global /absolute/path/to/approved-exhibit.tgz
```

With pnpm:

```bash
pnpm add --global /absolute/path/to/approved-exhibit.tgz
```

Both install the `exhibit` and `xbt` commands. See the package managers'
[npm install](https://docs.npmjs.com/cli/v11/commands/npm-install/) and
[pnpm add](https://pnpm.io/11.x/cli/add) documentation. These commands may download
runtime dependencies; the archive is not an offline dependency bundle.
Do not install the same CLI through multiple managers into competing PATH entries.

### Build from source when needed

Verify Node and pnpm versions and the approved checkout/revision. From that
approved repository root, run only after installation approval:

```bash
pnpm install --frozen-lockfile
pnpm pack
```

`pnpm pack` checks the skill bundles and builds the CLI through `prepack`, then
prints the archive path. Install that archive with npm or pnpm as shown above.
The source checkout uses `pnpm-lock.yaml`; do not substitute `npm install` or
generate a second lockfile there. This build requirement does not make pnpm a
runtime requirement for people installing a built archive.

### Permissions and PATH

Dependency installation can run lifecycle scripts; source installation also sets
up local Git hooks. Obtain approval before installing or changing the toolchain.
If the chosen manager's global binary directory is unavailable or unwritable,
review its PATH/permission configuration. Do not automatically use `sudo`, run
`pnpm setup`, or edit shell configuration.

Return to the original external project directory and repeat both version checks
and the chosen executable's help check. A command working only inside the source
checkout does not establish that the installed CLI is usable elsewhere.

## Continue with configuration

After CLI verification and once the intended config, credentials, and storage
target are known, the read-only connection check is:

```bash
xbt doctor --config /absolute/path/to/exhibit-config.json --json
```

Use the chosen executable. This performs signed storage listing; it is not a
purely local availability check. `xbt doctor --probe` additionally writes, fetches,
tests conditional operations, and deletes a temporary object, so it requires
separate intentional authorization.

If the `exhibit-setup` skill is unavailable, follow this bundled installation
guide directly; skill discovery is not an installation prerequisite. Everyday
CLI setup does not require engineering verification documents, browser-test
installation, or running source-quality CI. Those contributor checks are distinct
from verifying the local executable and its configured connection.
