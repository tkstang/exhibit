---
title: 'CLI reference'
description: 'Commands, flags, directory scope, JSON output, and exit codes.'
---

# CLI contract

`exhibit --help` is the authoritative option inventory. `xbt` is an installed
second binary, not a shell alias, and reads the same configuration/state.

## Commands

| Command                                          | Effect                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `publish <file>`                                 | Render, scan, encrypt by default, then conditional S3 write                |
| `publish --dry-run`                              | Validate inputs/password, render/scan locally; no cloud request or receipt |
| `list`                                           | One remote S3 page, filtered to recognized Exhibit artifacts               |
| `remove <slug>` / `rm <slug>`                    | Conditional deletion of one current recognized artifact                    |
| `remove --dry-run`                               | Read metadata; no deletion                                                 |
| `receipts <slug>`                                | Inspect local receipt metadata only; no cloud requests                     |
| `receipts <slug> --forget <body-sha256> --force` | Delete exactly one local receipt; no remote deletion                       |
| `doctor`                                         | Config and signed prefix-list check; read-only                             |
| `doctor --probe`                                 | Temporary non-sensitive write/fetch/conditional-operation/cleanup checks   |
| `init`                                           | Write non-secret local config; `--force` explicitly replaces it            |
| `--version`                                      | Version and local resource paths                                           |

All commands are noninteractive. Flags provide every input. No color is emitted,
so `NO_COLOR` works without terminal special cases. There is no `--yes` flag.
Forgetting a receipt requires `--force` to acknowledge possible permanent password
loss; previewing that deletion with `--dry-run` does not require `--force`.
Repeated options, unknown options, and options for another command are usage
errors, including on help/version invocations. Use `--` before a filename beginning
with a dash. Both `--name value` and `--name=value` work for string options;
boolean options such as `--json` take no value.

## Options

All commands accept `--config <file>`, `--json`, `-h` / `--help`, and `-v` /
`--version`. Config precedence is `--config`, `EXHIBIT_CONFIG`, then the per-user
default; see [configuration](configuration.md) for paths and environment variables.
`help` and `version` are also commands. Help/version do not contact storage.

| Command        | Option                     | Meaning/default                                                                          |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `publish`      | `--slug <slug>`            | Explicit 1-64 character lowercase-letter/digit/interior-hyphen slug; otherwise generated |
| `publish`      | `--dir <path>`             | Scope storage, URL, and receipts beneath configured roots                                |
| `publish`      | `--title <title>`          | Markdown title; defaults to the source basename without its extension                    |
| `publish`      | `--password <value>`       | Custom password; exposed to shell history/process arguments                              |
| `publish`      | `--password-env <NAME>`    | Read a set environment variable; name matches `[A-Z_][A-Z0-9_]*`                         |
| `publish`      | `--password-file <path>`   | Read a regular UTF-8 file; remove one trailing LF or CRLF                                |
| `publish`      | `--no-encrypt`, `--public` | Explicit plaintext mode; `--public` is a compatibility alias                             |
| `publish`      | `--overwrite`              | Permit conditional replacement; requires explicit `--slug`                               |
| `publish`      | `--no-store-password`      | Skip local receipt persistence; protect the result's only password copy                  |
| `publish`      | `--strict-secrets`         | Block any scanner finding in protected or public mode                                    |
| `publish`      | `--allow-secrets`          | Explicitly acknowledge findings; incompatible with `--strict-secrets`                    |
| `publish`      | `--dry-run`                | Local validation/render/scan preview only                                                |
| `list`         | `--dir <path>`             | List immediate artifacts in this scope                                                   |
| `list`         | `--limit <n>`              | Underlying S3 page size, 1-1000; default 100                                             |
| `list`         | `--cursor <token>`         | Continue the same scope from `next_cursor`                                               |
| `list`         | `--show-passwords`         | Include locally known passwords matching current remote digests                          |
| `remove`, `rm` | `--dir <path>`             | Scope the exact slug                                                                     |
| `remove`, `rm` | `--dry-run`                | Read remote metadata without deleting                                                    |
| `remove`, `rm` | `--missing-ok`             | Return success with `removed: false` if absent; leave receipts intact                    |
| `receipts`     | `--dir <path>`             | Select the local deployment/directory and exact slug                                     |
| `receipts`     | `--show-passwords`         | Explicitly include plaintext passwords in the local inventory                            |
| `receipts`     | `--forget <body-sha256>`   | Select exactly one local receipt by its 64-character lowercase hex body digest           |
| `receipts`     | `--force`                  | Acknowledge password loss for actual forgetting                                          |
| `receipts`     | `--dry-run`                | Preview `--forget`; no receipt deletion, no `--force` required                           |
| `doctor`       | `--probe`                  | Opt into temporary write/fetch/conditional-operation/delete checks                       |
| `init`         | `--bucket <name>`          | Required storage bucket                                                                  |
| `init`         | `--region <region>`        | Required storage region                                                                  |
| `init`         | `--public-base-url <url>`  | Required viewer URL root, distinct from the storage endpoint                             |
| `init`         | `--prefix <prefix>`        | Storage prefix; default `exhibit/`                                                       |
| `init`         | `--endpoint <url>`         | Optional S3-compatible API endpoint                                                      |
| `init`         | `--force-path-style`       | Use path-style S3 requests; default false                                                |
| `init`         | `--brand-name <name>`      | Public gate brand; default `Exhibit`                                                     |
| `init`         | `--force`                  | Explicitly replace the local config file                                                 |

Choose at most one custom password source. Custom passwords must have at least
16 characters, no control characters, and at most 1024 UTF-8 bytes. These checks
also run during a publish dry run. No password source is allowed in plaintext mode.

For `receipts`, `--show-passwords` and `--forget` are mutually exclusive.
`--force` and `--dry-run` require `--forget`.

A successful publish preview has `data.dry_run: true`, `data.remote_checked: false`,
and `W_DRY_RUN_LOCAL`. It generates no password, performs no encryption or cloud
request, and saves no receipt. It does not establish remote absence, ownership,
credentials, permissions, or conditional-operation support. Its URL is only a
prospective URL, not evidence of publication.

`--title` sets the Markdown document title. Standalone HTML retains its authored
`<title>` and receives a warning if this option is supplied; protected gate titles
remain generic in both cases.

## Directory and encryption

`publish`, `list`, `receipts`, and `remove` (including `rm`) accept `--dir <path>` or
`--dir=<path>`. The path is relative to both the configured storage prefix and its
matching public URL base. Omit it to use the configured root. No repository name
or directory is inferred from the source file.

```bash
xbt publish plan.md --dir repositories/exhibit --json
xbt list --dir repositories/exhibit --show-passwords --json
xbt rm <slug> --dir repositories/exhibit --dry-run --json
```

Use the same directory when listing, overwriting, or removing an artifact.
`list` includes only immediate artifacts, not subdirectories or a recursive inventory;
keep the directory unchanged when continuing with `--cursor`. The same slug can
exist independently in different directories, with separate password receipts.

Segments start with an ASCII letter or digit and may then contain letters, digits,
periods, underscores, or hyphens. A single trailing slash is optional. Empty paths,
absolute paths, `.`/`..`, repeated slashes, backslashes, URL encoding, queries, and
fragments are rejected. Combined paths must fit the existing prefix/URL limits.
Directory names are visible in URLs and storage keys; do not put secrets in them.

Encryption is on by default, including under `internal/`. `--no-encrypt` opts out;
`--public` remains an alias with exactly the same behavior. Neither flag configures
network access, and `--dir internal` does not create a VPN or Basic Auth gate.

```bash
# Encrypted even on an internal route.
xbt publish plan.md --dir internal/projects/redesign --json
# Readable plaintext: use only after deliberately choosing that exposure.
xbt publish plan.md --dir internal/projects/redesign --no-encrypt --json
```

Plaintext mode cannot be combined with any password source. It still scans for
potential secrets and blocks matches unless `--allow-secrets` is explicitly given.
Its base64 payload is not protection. Infrastructure restrictions must be configured
and verified separately before relying on them.

## JSON

```json
{
  "schema_version": 1,
  "ok": false,
  "command": "publish",
  "warnings": [],
  "error": {
    "code": "E_CONFLICT",
    "message": "The object exists or changed during this operation.",
    "hint": "Refresh with exhibit list. Your own earlier write may have succeeded. Use --overwrite deliberately; retry only after checking the current artifact and retained receipts."
  }
}
```

A success has `data`; a failure has `error` and top-level `warnings`. Collected
warnings survive later failure: inspect `data.warnings` on success and `warnings`
on failure. Both also produce diagnostic prose on stderr. Help/version/init do
not necessarily have a success warnings array. With `--json`, stdout contains one
envelope, including argument errors; parse stable codes rather than English text.
An output-stream failure can prevent envelope delivery and exits 2; the operation
may already have completed. Retain receipts and inspect state before retrying.
Failure details can contain diagnostic
checks or non-sensitive rule/line findings. Errors do not expose arbitrary AWS error
messages or secrets. `command` can be `unknown` if argument parsing failed.

List responses provide `next_cursor`; continue with `--cursor` until it is null.
`--limit` controls the underlying S3 page size, so a filtered page can contain fewer
artifacts, including zero. No count is presented as an account-wide total.

`list --show-passwords` explicitly joins local receipts to the current remote body
digest; an unknown password is null. This is not cloud key recovery. After a lost
PUT response, a prepared matching receipt can still supply the password.

`receipts <slug>` lists local metadata without cloud access. Status `prepared` or
`published` records local history, not current remote existence or ownership.
See [receipt recovery](recovery.md) before revealing or forgetting passwords.
The inventory returns `slug`, `remote_checked: false`, `receipts`, and `warnings`.
Each receipt contains `body_sha256`, `status`, `saved_at`, `url`, `etag`, and
`has_password`; `password` appears only with `--show-passwords`. Forget results
contain `slug`, `body_sha256`, `dry_run`, `forgotten`, `remote_checked: false`, and
`warnings`. An absent selected receipt is `E_NOT_FOUND`.

## Exit codes

| Exit | Meaning                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| 0    | Command succeeded; inspect warnings and `dry_run` before treating it as publication    |
| 1    | Actionable input, configuration, access, state, or supported-operation failure         |
| 2    | Unexpected, encryption/runtime, storage transport/response, or output-delivery failure |

The error code and context refine the exit status. For example, `E_STORAGE` can
exit 1 for an unsupported conditional operation or 2 for an uncertain PUT.

## Error codes

| Code                               | Action                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `E_USAGE`, `E_SLUG`, `E_PASSWORD`  | Correct inputs; do not weaken protection silently                                                  |
| `E_CONFIG_NOT_FOUND`, `E_CONFIG`   | Initialize/fix local config                                                                        |
| `E_CONFIG_EXISTS`                  | Choose a new file or explicitly authorize `init --force`                                           |
| `E_INPUT`                          | Check that input is a readable regular non-symlink file                                            |
| `E_INPUT_SIZE`                     | Input exceeds the applicable size limit                                                            |
| `E_INPUT_ENCODING`                 | Supply valid UTF-8 text                                                                            |
| `E_INPUT_TYPE`                     | Supply supported Markdown or HTML; no directory/ZIP support                                        |
| `E_SECRET_DETECTED`                | Review source; public publication is blocked by default                                            |
| `E_CONFLICT`                       | Refresh the current artifact before deciding to overwrite/retry                                    |
| `E_NOT_MANAGED`                    | Refusing an unrelated object; choose another slug/prefix                                           |
| `E_NOT_FOUND`                      | Remote artifact or selected local receipt absent; `rm --missing-ok` applies only to remote removal |
| `E_CREDENTIALS`, `E_BUCKET_ACCESS` | Repair provider credentials or least-privilege policy                                              |
| `E_STORAGE`                        | Check backend/network/conditional support; a failed write may have succeeded                       |
| `E_STATE`                          | Fix private local receipt permissions/storage before retrying                                      |
| `E_ENCRYPTION`, `E_DEPENDENCY`     | Check the pinned installation; never fall back to public                                           |
| `E_DOCTOR`                         | Inspect `error.details.checks` and any `cleanup_key`                                               |
| `E_NETWORK`                        | Reserved by the error union; no current CLI emission site                                          |
| `E_UNEXPECTED`                     | Unexpected failure or undeliverable output; inspect receipts and remote state before retrying      |

See `src/core/errors.ts` for the closed code union and
[troubleshooting](troubleshooting.md) for recovery examples.

## Warning codes

| Code                    | Meaning and action                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `W_PASSWORD_ARG`        | Direct password argument can enter history/process listings; prefer file or environment input                    |
| `W_CUSTOM_PASSWORD`     | Length validation does not establish strength; use a unique high-entropy password                                |
| `W_PASSWORD_NOT_STORED` | Publication result is the only password copy; save it securely                                                   |
| `W_SECRETS`             | Scanner found potential secrets in body or title; review before sharing, even if a later upload failed           |
| `W_DRY_RUN_LOCAL`       | Local preview only; remote state and permissions were not checked                                                |
| `W_HTML_TITLE`          | `--title` does not replace standalone HTML's authored title                                                      |
| `W_EXTERNAL_ASSETS`     | HTML may reference separate assets; single-file publication does not upload them                                 |
| `W_HTML_FRAGMENT`       | Browser must infer a document; prefer complete standalone HTML                                                   |
| `W_RAW_HTML`            | Raw HTML in Markdown is displayed as text                                                                        |
| `W_IMAGE_OMITTED`       | Markdown image omitted; assets are not uploaded                                                                  |
| `W_LINK_OMITTED`        | Unsafe/relative file link displayed as text; use an approved absolute target                                     |
| `W_STATE_SAVE`          | Upload succeeded but final local receipt/history update failed; retain prepared receipts                         |
| `W_STATE_READ`          | Matching local receipt could not be read; password output may be unavailable                                     |
| `W_STATE_REMOVE`        | Remote deletion succeeded but matching local receipt cleanup failed                                              |
| `W_DELETE_LIMITS`       | Current origin object removed; cached/downloaded copies and old versions remain possible                         |
| `W_LOCAL_RECEIPTS`      | Local inventory/forget results do not establish remote state; prepared receipts may belong to successful uploads |
| `W_FORGET_PASSWORD`     | Forget or its preview may lose the only password; neither removes remote artifacts nor revokes copies            |

Doctor additionally reports checks with `status: "warn"` in `checks`; these are
not `W_*` codes. Inspect checks on both healthy and failed probe results.
