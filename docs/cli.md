# CLI contract

`exhibit --help` is the authoritative option inventory. `xbt` is an installed
second binary, not a shell alias, and reads the same configuration/state.

## Commands

| Command                       | Effect                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| `publish <file>`              | Render, scan, encrypt by default, then conditional S3 write              |
| `publish --dry-run`           | Read/render/scan only; no network request or persisted password          |
| `list`                        | One remote S3 page, filtered to recognized Exhibit artifacts             |
| `remove <slug>` / `rm <slug>` | Conditional deletion of one current recognized artifact                  |
| `remove --dry-run`            | Read metadata; no deletion                                               |
| `doctor`                      | Config and signed prefix-list check; read-only                           |
| `doctor --probe`              | Temporary non-sensitive write/fetch/conditional-operation/cleanup checks |
| `init`                        | Write non-secret local config; `--force` explicitly replaces it          |
| `--version`                   | Version and local resource paths                                         |

All commands are noninteractive. Flags provide every input. No color is emitted,
so `NO_COLOR` works without terminal special cases. No `--yes` is needed: invoking
a mutation is intentional, while `--dry-run` is explicit preview.

`--title` sets the Markdown document title. Standalone HTML retains its authored
`<title>` and receives a warning if this option is supplied; protected gate titles
remain generic in both cases.

## JSON

```json
{
  "schema_version": 1,
  "ok": false,
  "command": "publish",
  "error": {
    "code": "E_CONFLICT",
    "message": "The object exists or changed during this operation.",
    "hint": "Inspect the current artifact before retrying."
  }
}
```

A success has `data`; a failure has `error`. Failure details can contain diagnostic
checks or non-sensitive rule/line findings. Errors do not expose arbitrary AWS error
messages or secrets. `command` can be `unknown` if argument parsing failed.

List responses provide `next_cursor`; continue with `--cursor` until it is null.
`--limit` controls the underlying S3 page size, so a filtered page can contain fewer
artifacts, including zero. No count is presented as an account-wide total.

`list --show-passwords` explicitly joins local receipts to the current remote body
digest; an unknown password is null. This is not cloud key recovery. After a lost
PUT response, a prepared matching receipt can still supply the password.

## Common codes

| Code                               | Action                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `E_USAGE`, `E_SLUG`, `E_PASSWORD`  | Correct inputs; do not weaken protection silently                            |
| `E_CONFIG_NOT_FOUND`, `E_CONFIG`   | Initialize/fix local config                                                  |
| `E_CONFIG_EXISTS`                  | Choose a new file or explicitly authorize `init --force`                     |
| `E_INPUT*`                         | Check file type, size, encoding, permissions; no directory/ZIP support       |
| `E_SECRET_DETECTED`                | Review source; public publication is blocked by default                      |
| `E_CONFLICT`                       | Refresh the current artifact before deciding to overwrite/retry              |
| `E_NOT_MANAGED`                    | Refusing an unrelated object; choose another slug/prefix                     |
| `E_CREDENTIALS`, `E_BUCKET_ACCESS` | Repair provider credentials or least-privilege policy                        |
| `E_STORAGE`                        | Check backend/network/conditional support; a failed write may have succeeded |
| `E_STATE`                          | Fix private local receipt permissions/storage before retrying                |
| `E_ENCRYPTION`, `E_DEPENDENCY`     | Check the pinned installation; never fall back to public                     |
| `E_DOCTOR`                         | Inspect `error.details.checks` and any `cleanup_key`                         |

See `src/core/errors.ts` for the closed code union and
[troubleshooting](troubleshooting.md) for recovery examples.
