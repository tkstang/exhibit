---
title: Receipt and publication recovery
description: Inspect uncertain uploads and deliberately forget exact local receipts without assuming remote state.
---

# Receipt and publication recovery

Use this guide after an upload timeout, a missing PUT ETag, lost command output,
or a local receipt warning. Preserve the same config, `--dir`, state directory,
and slug used for the attempted publication. Receipts are plaintext secrets;
keep them and any backups private.

## Inspect an uncertain publication

1. Stop automatic retries. `E_STORAGE`, a conflict, or output delivery failure
   can follow a successful upload. A PUT response without an ETag is uncertain
   `E_STORAGE`, not evidence of an unrelated object. Keep prepared receipts.
2. Inspect local metadata without cloud requests:

   ```bash
   xbt receipts review --dir projects/demo --json
   ```

   Replace `review` and `projects/demo` with the actual slug and directory; omit
   `--dir` for the configured root. Use the original `--config` when needed.
   `prepared` means the local pre-upload record was saved; `published` means a
   successful response was recorded locally. Neither proves current remote state.

3. When remote inspection is authorized and available, list the same scope:

   ```bash
   xbt list --dir projects/demo --show-passwords --json
   ```

   This makes cloud reads and may expose passwords. Continue every `next_cursor`
   with the same config and directory until null. A matching receipt, including
   one still marked prepared, can supply the current remote revision's password.
   An empty filtered page or incomplete/failed listing does not prove absence.

4. Verify the expected current artifact and password privately before deciding
   whether to publish again. Overwrite only with explicit intent and `--overwrite`;
   Exhibit retains ETag conditions. Never bypass a conflict with an unconditional
   write. A replacement usually generates a new password.

A HEAD 403 can mean denied access rather than absence. Exhibit makes an exact-key
prefix-scoped list request and accepts absence only from a successful untruncated
result without that exact key. Listing never proves ownership; management still
requires recognized metadata from HEAD. Do not broaden permissions or claim a
receipt is orphaned because a request was denied.

## Recover a password

`list --show-passwords` matches the current remote body digest. To inspect all
local revisions for an exact slug without contacting storage, use:

```bash
xbt receipts review --dir projects/demo --show-passwords --json
```

Protect stdout, shell scrollback, screenshots, and agent transcripts. A password
must be inspected separately: `--show-passwords` cannot accompany `--forget`.
A password cannot be recovered from S3 ciphertext if its receipt and all other copies are
lost. With `--no-store-password`, lost publication output can mean permanent
password loss. There is no password reset for an already downloaded copy.

## Forget one local receipt

Forgetting is separate from remote removal. Before doing it, obtain informed
consent for the exact deployment, directory, slug, and body digest. Explain that
this may erase the only password for a live artifact, old object version, or
downloaded copy. Securely retain a password copy when it is still needed.

Set `RECEIPT_DIGEST` to the exact 64-character lowercase body digest returned by
the local inventory. Preview first; no `--force` is required for this command:

```bash
xbt receipts review --dir projects/demo --forget "$RECEIPT_DIGEST" --dry-run --json
```

After reviewing that exact target and consenting to its password loss:

```bash
xbt receipts review --dir projects/demo --forget "$RECEIPT_DIGEST" --force --json
xbt receipts review --dir projects/demo --json
```

Verify that the selected digest is absent from the local inventory. These commands
do not contact cloud storage, remove an artifact, or revoke downloaded content.
There is no automatic age-based or orphan cleanup. Local status, age, or failure
to match the current remote revision is not proof a password is dispensable.
There is no undo command; recovery requires a private backup or another password copy.

Successful inventory, preview, and forget results report `remote_checked: false`
and `W_LOCAL_RECEIPTS`. A forget or its preview also reports `W_FORGET_PASSWORD`.
`--force` and `--dry-run` require `--forget`; an absent selected receipt produces
`E_NOT_FOUND` rather than a successful deletion.

## Resolve receipt warnings

If inventory fails with `E_STATE`, pause local Exhibit writers and privately back
up the state directory before inspecting it. A stray `.DS_Store`, interrupted-write
`.exhibit-*.tmp`, or damaged receipt causes inventory to fail closed. Move only
identified stray entries to a private backup outside the inventory and restore
damaged receipts from a trusted backup. Keep originals and passwords; do not delete
receipts or loosen their permissions to bypass the check. Retry after repair.

- `W_STATE_SAVE`: keep the prepared receipt after a successful upload whose final
  receipt update failed. For public artifacts, local history may not have saved.
- `W_STATE_READ`: check state location, ownership, permissions, and disk health;
  missing password output does not mean no password exists.
- `W_STATE_REMOVE`: remote removal succeeded but the matching local receipt remains.
  Inspect and forget only that exact digest after informed consent.
- `W_DELETE_UNCONFIRMED`: DELETE returned not-found and a subsequent listing
  suggested absence, but did not confirm deletion. Exhibit reports `removed: false`
  and retains all receipts; a compatible backend may serve a stale listing.
  Independently verify the origin before considering exact-digest forgetting.

After confirmed conditional deletion, `rm` removes only the receipt matching the
observed deleted remote revision.
Other receipts remain. `rm --missing-ok` accepts remote absence and leaves local
receipts intact. Remote deletion cannot revoke cached/downloaded copies or old
S3 versions. Never remove an entire state directory as a recovery shortcut.
