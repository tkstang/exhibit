# Configuration

## Locations

On macOS/Linux, defaults are `$XDG_CONFIG_HOME/exhibit/config.json` and
`$XDG_STATE_HOME/exhibit/`, falling back to `~/.config/exhibit/config.json` and
`~/.local/state/exhibit/`. On Windows they use `%APPDATA%` for config and
`%LOCALAPPDATA%` for state, each under `exhibit`.

Override the config with `--config /absolute/path.json` or `EXHIBIT_CONFIG`.
Override state with `EXHIBIT_STATE_DIR`. Relative explicit overrides resolve from
the process working directory. XDG base directories must be absolute.

Configuration and password receipts are separate. Only the former is suitable
for committing once you review it for environment identifiers.

## Complete configuration

```json
{
  "schemaVersion": 1,
  "storage": {
    "provider": "s3",
    "bucket": "my-exhibit-artifacts",
    "region": "us-east-1",
    "prefix": "exhibit/",
    "forcePathStyle": false
  },
  "publicBaseUrl": "https://share.example.com",
  "maxInputBytes": 2097152,
  "brand": {
    "name": "Exhibit",
    "accent": "#0f766e"
  }
}
```

`storage.endpoint` is optional for an S3-compatible API. It is **not** the public
viewer URL. `region: "auto"` is appropriate only for a service that specifies it.

The schema rejects unknown fields, including misplaced credentials. It requires
HTTPS, except explicit loopback HTTP for local development, and rejects URL userinfo,
query strings, and fragments. The default input limit is 2 MiB, configurable up to
10 MiB. Encryption and encoding increase the final HTML size.

## URL and prefix mapping

The public base URL maps to the configured object prefix. Exhibit does not append
the prefix again when constructing the URL:

```text
bucket:          my-exhibit-artifacts
prefix:          exhibit/
object key:      exhibit/review.html
publicBaseUrl:   https://share.example.com
returned URL:    https://share.example.com/review.html
CloudFront origin_path: /exhibit
```

For a CDN with no origin-path rewrite, configure the public URL to include the
prefix instead:

```text
publicBaseUrl: https://share.example.com/exhibit
returned URL: https://share.example.com/exhibit/review.html
```

Do not configure both a path-bearing public URL and an origin rewrite that adds
the same prefix twice. `doctor --probe` catches the resulting wrong-object route.
`.html` is intentional: no directory index or extension rewrite is needed.

`--dir` appends the same relative path to the configured prefix and public URL
base. For example, with prefix `exhibits/` and base URL `https://share.example.com`:

```text
command:      xbt publish plan.md --slug review --dir internal/projects/redesign
object key:   exhibits/internal/projects/redesign/review.html
returned URL: https://share.example.com/internal/projects/redesign/review.html
```

This does not change CDN routing or access rules. The configured URL must map to
the configured prefix for every directory used. If different routes use different
origin rewrites, use separate matching configurations; `--dir` is not a routing
table and does not switch deployments. Receipt identity includes the effective
directory, so use the same `--dir` for subsequent management commands.

## Credentials

Exhibit supplies no `credentials` option to the AWS SDK. Use the normal provider
chain: existing profiles, supported SSO/profile flows, environment variables,
instance/container roles, or web identity as appropriate for your environment.
`AWS_PROFILE` selects a profile. Refresh expired credentials outside Exhibit.

Never put keys in JSON examples, public HTML, logs, or agent skill instructions.
An S3-compatible endpoint often uses provider-issued credentials through the same
AWS environment/profile mechanism.

## Password receipts

A generated/custom password is stored locally by default, in a receipt keyed by
deployment identity, slug, and uploaded-body digest. POSIX directories must be
private (0700) and files are created as 0600. Existing permissive state directories
are refused rather than silently changing unrelated directory permissions.
Windows filesystem ACLs remain the operating system/user's responsibility.

Receipts are plaintext secrets on your disk. Use a trusted local location; encrypted
storage and secure backups are your responsibility. `--no-store-password` opts out
and makes the result output your only copy. This is not a recovery service.

## Custom passwords

```bash
# Value must be supplied through your secret manager or a private file.
xbt publish plan.md --password-env EXHIBIT_REVIEW_PASSWORD --json
xbt publish plan.md --password-file /private/review-password.txt --json
```

Minimum 16 characters, maximum 1024 UTF-8 bytes, no control characters. A single
trailing newline is removed from password files. Length is not an entropy test.
Fresh generated passwords are recommended. The literal `--password` flag warns
because shell history/process listings may expose its value.
