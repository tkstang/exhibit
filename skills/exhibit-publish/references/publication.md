# Publication safety and recovery

These checks apply wherever the skill is installed. No Exhibit checkout is needed.

## Source and destination

Publish only the exact file authorized by the user. Markdown and standalone HTML
are single-file snapshots; adjacent assets and directories are not uploaded.
Inline HTML interaction works inside an opaque-origin sandbox; remote scripts,
fonts, images, and network requests are blocked. Markdown images are omitted.

Confirm the approved config and audience before publication. Pass an absolute
`--config` path when the organization supplies one. `--dir` is relative to both
the configured object prefix and matching viewer URL. Reuse the same config and
directory for listing, overwrites, and removal. Directory and explicit slug names
are visible, so avoid confidential names.

Under a gated-by-default deployment, `public/repositories/<repo>` selects the
external route and `repositories/<repo>` the gated route. That is an infrastructure
convention, not CLI enforcement. Neither route changes default encryption.
`--no-encrypt`, also named `--public`, exposes plaintext to anyone who can fetch
the viewer. Never infer permission for it from the word "public" in an audience.

## Output and state

Parse one JSON envelope on stdout. Require `ok: true` and `data.dry_run: false`
before calling a link live. Return passwords only to intended recipients.
stderr is diagnostic output. Never paste complete publish results, receipts, or
custom passwords into shared logs or PRs.

Read `data.warnings` on success and top-level `warnings` on failure; warnings
collected before an uncertain upload still matter. A publish dry run validates
custom passwords and scans body and title, but remains local-only. It returns
`remote_checked: false` and `W_DRY_RUN_LOCAL`, generates no password, and does not
check remote existence, ownership, permissions, or conditional operations.

Generated passwords are stored in private local receipts unless the user opts
out. Receipts are plaintext secrets, not canonical remote state or a vault.
`list --show-passwords` intentionally reveals matching local passwords. Protect
the output. Lost receipts cannot be recovered from S3.

## Failures and mutations

- `E_SECRET_DETECTED`: review the source; do not automatically add `--allow-secrets`.
- `E_CONFLICT`: inspect remote state; do not retry with an unconditional overwrite.
- `E_NOT_MANAGED`: do not modify the unrelated object.
- `E_STATE`: repair private local state with the user; do not disable receipts to bypass it.
- `E_DEPENDENCY` or `E_ENCRYPTION`: repair the installation; never switch to plaintext.
- Configuration/credential errors: direct to setup; do not create IAM keys or grants.

A timeout can hide a successful upload. Prepared receipts may contain its password.
Inspect the current artifact before retrying. Failed overwrites must not discard
the previous password. Each protected replacement normally has a new password.

A PUT response missing its ETag is uncertain `E_STORAGE`, not `E_NOT_MANAGED`.
An `E_CONFLICT` may follow your own successful earlier write. Retain receipts and
inspect the same config/directory before retrying. Any scanner finding blocks
public mode by default; source text and rendered Markdown titles are scanned,
without a severity threshold. HTML titles are scanned as part of the source text;
unused HTML filename-derived titles are not scanned separately.

`xbt receipts <slug> [--dir <path>] --json` lists local metadata without cloud
requests. `--show-passwords` explicitly reveals retained passwords, separately
from `--forget`. Neither `prepared` nor `published` classifies remote orphans.
Inventory/forget results carry `W_LOCAL_RECEIPTS` and `remote_checked: false`.

Only with informed consent for the exact receipt, use
`xbt receipts <slug> --forget <body-sha256> --force [--dir <path>] --json`.
It deletes that local receipt only and may erase the only password for a live
artifact or retained copy. Preview with `--dry-run` without `--force`; both
preview and deletion carry `W_FORGET_PASSWORD`. Do not combine `--show-passwords`
with `--forget`. Never automatically clean receipts by age or assumed orphan status.

`xbt rm <slug> [--dir <path>] --missing-ok` accepts an absent remote object without
removing receipts. Confirmed removal deletes only the receipt matching the observed
remote body digest; other revisions remain. No local forgetting revokes remote copies.
`W_DELETE_UNCONFIRMED` with `removed: false` means a not-found DELETE and a listing
only suggested absence. Keep all receipts: compatible backends can serve stale
listings. Independently verify the origin before any exact-digest forgetting.

`xbt doctor` is read-only, but `xbt doctor --probe` writes and deletes a temporary fixture
and needs separate intentional authorization. Removal needs authorization for the
exact artifact and cannot revoke downloaded copies or noncurrent object versions.
