---
title: 'Troubleshooting'
description: 'Diagnose configuration, publication, viewer, and cleanup failures.'
---

# Troubleshooting

## The command is not found

Check both `exhibit --version --json` and `xbt --version --json` from the project
where you intend to use Exhibit. If neither is installed, obtain installation
authorization, use Node 24, and choose `npm install --global @tkstang/exhibit@latest`
or `pnpm add --global @tkstang/exhibit@latest`. The
[installation guide](installation.md) covers pinning an approved published version,
approved archive/source alternatives, and version/help verification.

If already installed, check that the chosen manager's global binary directory is
on PATH. Both names are package binaries. Resolve a broken installation before
reinstalling or upgrading. Do not use `sudo` or automatically change PATH, clone,
or fetch a checkout. In an approved, already-built source checkout,
`node dist/cli.js --help` bypasses global installation; it does not verify that the
CLI is available in other projects.

## Config exists, but the command cannot use it

Use `exhibit --config /absolute/path.json doctor --json`. No cloud keys belong in
that file. Unknown fields are rejected. Input must be UTF-8 JSON and regular files,
not symlinks. Run `init --force` only when replacing the existing file is intended.

## A password receipt cannot be saved

Check `EXHIBIT_STATE_DIR`, ownership, free space, and private directory/file modes.
A protected upload stops before issuing PUT if its prepared password receipt cannot
be saved. This is deliberate. Do not use `--no-store-password` merely to suppress
the error unless you accept that the output is the only password copy.

A warning after a successful upload can indicate failure updating the final receipt;
the prepared receipt remains useful. Do not discard it. Never commit state files.
Use `xbt receipts <slug>` for a local-only inventory and follow
[receipt recovery](recovery.md) before revealing or forgetting passwords.

## AccessDenied / credential failures

Verify the right profile, region, bucket, and prefix. The publisher needs signed
ListBucket and Get/Put/DeleteObject permissions. A CDN needs separate origin-read
permission. Anonymous viewers do not need either credential. Do not switch to public
bucket ACLs as an expedient fix.

On HEAD 403, Exhibit uses an exact-key prefix-scoped list only to establish absence
from a successful untruncated response. A listed key does not establish ownership
or grant permission to overwrite it; denied/inconclusive reads remain errors.

## Upload succeeded, but the URL is 403/404

Check `publicBaseUrl`, the origin-path prefix mapping, OAC/bucket policy, regional
REST endpoint, and deployment propagation. The example produces `.html` URLs; no
extensionless rewrite is expected. A failed doctor probe reports an exact cleanup
key if cleanup cannot be confirmed. A denied probe upload with no visible probe
object reports a skipped cleanup check and no cleanup key.

## Doctor fails off VPN but the page opens on VPN

With split DNS, those requests may use different delivery paths. `doctor` without
`--probe` checks signed S3 listing only. The active probe fetches a generated URL
at the configured root and cannot send Basic Auth credentials. Under the
public-directory-only policy, an off-VPN probe at that root reaches the Basic
Auth gate even when S3 writes work.

Follow the [per-path verification procedure](deployment/cloudfront.md#verify-each-delivery-path).
Use a reviewed public-subtree config for an authorized off-VPN probe; do not
disable authentication, add credentials to the URL, or claim that one successful
probe verified both routes. Check cleanup even when retrieval fails.

## The page downloads or the gate is blank

Verify `Content-Type: text/html`, no `Content-Disposition: attachment`, and the
reference CSP. A blanket `default-src 'none'` without permitted inline scripts
prevents browser decryption. The shipped gate also requires a secure browser context:
HTTPS or a genuine loopback development origin. A screenshot/rendering harness on
`about:blank` is not an HTTPS round-trip test.

## Source images/scripts do not work

Only a self-contained file is supported. Bundle assets into the document; do not
expect adjacent files, CDN libraries, fonts, images, or fetch calls to be uploaded.
Markdown images are intentionally omitted with a warning. Do not weaken the global
CSP just to silence a resource error.

## An overwrite failed or timed out

Do not automatically re-run with an unconditional write. List the remote slug and
inspect the current result/ETag. Generated passwords from attempted writes may be
in prepared local receipts. `list --show-passwords` selects a receipt matching the
current remote digest, including a prepared receipt when appropriate.

A successful PUT response missing its ETag is also uncertain `E_STORAGE`. Retain
receipts and inspect the remote artifact before retrying. Review top-level
`warnings` on failed JSON envelopes too: a failed upload may have succeeded after
`W_SECRETS` was collected. Follow [receipt recovery](recovery.md).

A stable slug does not guarantee a stable password. Each protected publication uses
a fresh generated password unless you supply a custom password. Distribute the
new password when intentionally replacing an artifact.

## Deletion did not revoke a link everywhere

Check CDN caching on an existing deployment. The reference uses zero TTL/no-store,
but previously cached/downloaded copies and older S3 versions cannot be revoked by
removing the current object. This is a limitation of this sharing model, not an
implementation of expiring access tokens.

## S3-compatible uploads work, but doctor conditionals fail

Do not use the backend for concurrent mutation until it honors the required
conditions. Exhibit does not drop conditional headers to get an apparent success.
Check the particular provider/version's support for conditional DeleteObject and
PutObject, not just basic S3 API compatibility.

## Reporting a problem

Include version, command name, stable error code, non-sensitive config shape, and
whether the operation reached remote storage. Redact bucket/account identifiers as
needed. Never paste passwords, source content, SDK credentials, local receipts,
or complete publication JSON containing a password into a public issue.
