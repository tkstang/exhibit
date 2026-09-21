export const VERSION = '0.1.1';
export const HELP = `Exhibit — share a document, not a workspace.

Usage: exhibit <command> [options]
       exhibit help [command]   Show this help; the command name is validated
Alias: xbt (same executable)

Commands:
  publish <file>   Render Markdown or preserve standalone HTML, encrypt, and upload
  list            List remote Exhibit artifacts, one page at a time
  remove <slug>   Conditionally delete a managed artifact (alias: rm)
  receipts <slug> Inspect retained local receipts; no cloud requests
  doctor          Read-only configuration/credential/bucket checks
  init            Write local non-secret configuration; never provisions cloud resources

Global options:
  --config <file>           Override EXHIBIT_CONFIG / the per-user config file
  --json                    Exactly one JSON envelope on stdout; diagnostics on stderr
  -h, --help                Show help
  -v, --version             Show version

Artifact scope (publish, list, remove, receipts):
  --dir <path>              Relative directory beneath the configured prefix and URL base
                            Does not set access controls; encryption stays on by default

Publish:
  --slug <slug>             1–64 lowercase letters/digits/interior hyphens; default opaque
  --title <title>           Markdown title (HTML keeps its authored title; gate is generic)
  --no-encrypt              Deliberately publish readable plaintext (base64 is NOT encryption)
  --password <value>        Custom 16+ character password; visible in shell history/process args
  --password-env <NAME>     Safer custom password source
  --password-file <path>    Read password from a regular UTF-8 file
  --overwrite               Replace an existing Exhibit object with an ETag condition
  --no-store-password       Do not keep a local password receipt
  --strict-secrets          Block all potential secret matches
  --allow-secrets           Acknowledge findings (plaintext secret matches otherwise block)
  --dry-run                 Render/scan only; no cloud requests, writes, or password generated

List:
  --limit <n>               S3 page size 1–1000; default 100
  --cursor <token>          Continue from next_cursor
  --show-passwords          Explicitly include matching local passwords in output

Remove:
  --dry-run                 Inspect only
  --missing-ok              Absent remote object is not an error

Receipts:
  --show-passwords          Explicitly reveal locally retained passwords
  --forget <body-sha256>    Select one exact local receipt to forget; never deletes remote data
                            Cannot be combined with --show-passwords; requires --force or --dry-run
  --dry-run                 Requires --forget; inspect the selected receipt without forgetting it
  --force                   Requires --forget; acknowledge permanent loss of its password

Doctor:
  --probe                   Explicitly write/fetch/delete a non-sensitive encrypted fixture;
                            also test conditional write/delete support

Init:
  --bucket <name> --region <region> --public-base-url <https://host[/path]>
  --prefix <prefix>         Default exhibit/; CDN origin path must map to this prefix
  --endpoint <url>          S3-compatible API endpoint, distinct from the public viewer URL
  --force-path-style        For S3-compatible servers requiring path-style requests
  --brand-name <name>       Default Exhibit
  --force                   Replace existing local config

Examples:
  exhibit init --bucket my-exhibits --region us-east-1 --public-base-url https://share.example.com
  xbt doctor --probe --json
  xbt publish plan.md --json
  xbt publish report.html --slug weekly-review --overwrite --json
  xbt publish plan.md --dir repositories/exhibit --json
  xbt publish report.html --dir public/reviews --json
  xbt publish report.html --dir projects/reviews --no-encrypt --json
  xbt list --dir projects/reviews --json

No account, database, service deployment, or MCP server is required.
Read docs/user-guide/security-model.md before sharing sensitive material.
`;
