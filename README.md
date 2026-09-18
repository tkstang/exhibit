# Exhibit

**Share a document, not a workspace.**

Publish Markdown or standalone HTML to your own S3-compatible storage and get a
browser-viewable URL. Protected artifacts are encrypted before upload and unlock
locally in the recipient's browser. No accounts, database, application server,
or GitHub access required for viewers.

```bash
xbt publish design.md --json
```

`exhibit` and `xbt` are two binaries pointing at the same entrypoint.

> **Locally validated initial release.** Node 24 build, installed-dependency tests,
> desktop/mobile HTTP browser flows, package contents, and Terraform validation
> pass. Live S3/CDN qualification is still pending. See [verification](docs/engineering/verification.md).

## The model

```text
Markdown or standalone HTML
  → render / scan
  → encrypt in the CLI
  → private S3
  → public HTTPS CDN URL
  → password entered and decrypted in the browser
```

The URL delivers **ciphertext**, not server-side authentication. A password holder
can save the document. Removing the current object cannot revoke copies already
downloaded. Read the [security model](docs/user-guide/security-model.md).

## Start locally

Requires Node 24 and pnpm 11. The scoped package name is `@tkstang/exhibit`; this
archive does not claim that package has already been published to npm.

```bash
cd exhibit
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm add -g .                 # Makes BOTH exhibit and xbt available with pnpm 11.
```

`pnpm setup` may be needed to configure pnpm's global binary directory. Review
shell changes before running it. Alternatively use `node dist/cli.js` directly.

Try the local example without AWS:

```bash
pnpm preview
# Open http://localhost:8787/protected.html
# Demo password: exhibit-demo-password
```

The demo password is only for the non-sensitive example.

For a new checkout/worktree, `pnpm worktree:init` installs locked dependencies,
configures hooks, builds, and refreshes project OAT views. See [Development](docs/engineering/development.md).

## Configure and publish

Provision [private S3 + CloudFront](examples/terraform/aws/README.md), or connect
an [existing bucket and CDN](docs/user-guide/deployment/s3.md). Credentials come from the AWS SDK's normal
provider chain, not from Exhibit config.

```bash
exhibit init \
  --bucket my-exhibit-artifacts \
  --region us-east-1 \
  --prefix exhibit/ \
  --public-base-url https://share.example.com

exhibit doctor               # Read-only signed listing/configuration checks.
exhibit doctor --probe       # Explicit temporary write/fetch/conditional-delete checks.
xbt publish examples/artifacts/plan.md --json
```

A successful publication returns one JSON object:

```json
{
  "schema_version": 1,
  "ok": true,
  "command": "publish",
  "data": {
    "slug": "exhibit-<random-id>",
    "url": "https://share.example.com/exhibit-<random-id>.html",
    "protected": true,
    "password": "<generated-password>",
    "warnings": []
  }
}
```

This is an abbreviated example. The actual result also includes identity,
ETag, dates, size, and state-persistence details. Treat publication output as a
secret because it contains the password. Diagnostics never include passwords.

## Daily commands

```bash
xbt publish plan.md                           # New opaque URL, fresh random password.
xbt publish report.html --slug review         # Deliberately named URL.
xbt publish report.html --slug review --overwrite
xbt publish announcement.md --no-encrypt      # Readable plaintext, NOT encrypted.
xbt publish plan.md --dry-run --json          # Render/scan; no S3 request or mutation.
xbt list --json                              # Remote objects, no passwords by default.
xbt list --show-passwords --json              # Explicitly include matching local receipts.
xbt rm review --dry-run
xbt rm review
```

Use `--dir` to place artifacts beneath the configured storage prefix and URL base:

```bash
xbt publish plan.md --dir repositories/exhibit --json
xbt list --dir repositories/exhibit --json
xbt rm <slug> --dir repositories/exhibit --json
xbt publish plan.md --dir public/repositories/exhibit --json
xbt publish report.html --dir projects/reviews --no-encrypt --json
```

Encryption stays on by default in every directory. `--no-encrypt` deliberately
disables it; `--public` remains a compatibility alias. Naming a directory `internal`
does not restrict access: VPN/Basic Auth must already be enforced by your hosting
infrastructure. See [directory scope](docs/user-guide/cli.md#directory-and-encryption).

For a suggested `exhibits/` hierarchy and matching config, see the
[proposed bucket layout](docs/user-guide/deployment/bucket-layout.md). It includes repository/project
namespaces and leads with a gated-by-default policy: only `/public/` descendants
bypass VPN or Basic Auth. The [`/internal/`-only policy](docs/user-guide/deployment/bucket-layout.md#alternative-internal-directory-only)
is an alternative. Neither policy is enforced by the CLI or the unmodified
new-bucket Terraform example. The [split-DNS example](docs/user-guide/deployment/cloudfront.md#split-dns-delivery-example)
shows public and VPN delivery through one hostname without assuming deployment.

Overwrites are explicit and conditional on the observed ETag. Deletion is limited
to a recognized Exhibit artifact at an exact slug. There is no bucket-wide delete.

Generated passwords are 192-bit random values. Safer custom-password interfaces
are `--password-env NAME` and `--password-file PATH`; direct `--password` is
supported but can expose the secret in shell history and process arguments.

## What ships

- Markdown with GFM tables, tasks, code, headings, and responsive light/dark styling.
- Standalone HTML with inline JavaScript preserved inside an opaque-origin sandbox.
- Upstream StatiCrypt encryption, generic protected gate, no remembered browser keys.
- AWS SDK v3 storage, conditional updates, paginated listing, and local-only receipts.
- Agent-first JSON CLI with stable error codes and no interactive prompts.
- [Publishing](skills/exhibit-publish/SKILL.md) and [setup](skills/exhibit-setup/SKILL.md) agent skills.
- An [organization wrapper example](docs/user-guide/agents/organization-skill.md) with bundled deployment and branding config.
- [AWS Terraform](examples/terraform/aws/README.md), Fastly guidance, and S3-compatible notes.
- Unit/contract tests, browser tests, a local preview, and [development guidance](docs/engineering/development.md).

No ZIP/directory hosting, exact expiry, burn-after-read, remote MCP, accounts,
comments, or collaboration in this version. External images/scripts/fonts and
network requests are deliberately blocked. Publish **self-contained** HTML.

## Documentation

Start with [Getting started](docs/user-guide/getting-started.md), [Configuration](docs/user-guide/configuration.md),
and [Security](docs/user-guide/security-model.md). The [documentation index](docs/index.md)
covers infrastructure, agent usage, implementation decisions, and troubleshooting.

MIT licensed. `private: true` prevents accidental npm publication; see
[Development](docs/engineering/development.md) for deliberate release steps.

## Acknowledgments

Inspired by [Hushdrop](https://github.com/maxtechera/hushdrop). Encryption uses
[StatiCrypt](https://github.com/robinmoisson/staticrypt). See
[third-party notices](THIRD-PARTY-NOTICES.md) for attribution and licenses.
