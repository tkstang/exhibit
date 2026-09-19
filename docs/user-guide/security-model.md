---
title: 'Security model'
description: 'Encryption, browser isolation, local secrets, and hosting trust boundaries.'
---

# Security model

## What is protected

Exhibit encrypts the complete rendered document in the publishing process using
StatiCrypt 3.5.4. Only the resulting encrypted viewer is uploaded for protected
publication. Markdown is rendered before encryption; standalone HTML is preserved
as the encrypted payload.

The public shell contains a generic title, brand, salt, signed ciphertext, the
upstream decryption code, and viewer controls. It does not contain the source title,
source path, password, or a digest of the protected plaintext. Default slugs are
opaque. Explicit slugs, brand names, content size, dates, and object metadata can
still reveal information. Avoid sensitive names in slugs and branding.

The S3 bucket stays private behind CloudFront OAC in the reference deployment.
Anyone who possesses the public URL can download its ciphertext. No identity check
or password verification happens at S3 or the CDN. Recipients decrypt in their
browser using the password you give them.

## Cryptography boundary

Exhibit does not implement its own cipher, KDF, or MAC. The adapter invokes
StatiCrypt's pinned upstream codec and embeds its actual browser implementation.
Its source uses AES-CBC with HMAC-SHA256 and the upstream password-derivation
procedure. See [source references](../engineering/sources.md). A salt is public, not a password.

Encryption happens in memory, avoiding plaintext temporary files and passwords in
subprocess arguments. Generated passwords use 24 random bytes encoded as base64url
(192 bits). A user-chosen password is checked for length and control characters,
not proven strong. A downloaded artifact permits offline guessing; there is no
rate-limiting server to protect a weak password.

The adapter intentionally fails if the installed StatiCrypt version is not 3.5.4.
Upgrades require reviewing its API, generated scripts, CSP, and round-trip/browser
tests. This project has not received an independent security audit.

## Browser isolation and network policy

Both public and protected documents render in an iframe with an opaque origin.
The sandbox permits inline script execution, downloads, and user-activated outbound
links, but not same-origin access, forms, or top-level navigation. Source scripts
cannot read the parent gate's DOM or localStorage through same-origin access.
Inline interactivity remains available.

Ordinary fragment links scroll inside the document instead of navigating the
iframe to the outer viewer. This is not a full hash router: the helper does not
update `location.hash`, emit `hashchange`, or activate CSS `:target`. Standalone
HTML that depends on those behaviors needs its own inline interaction logic.

The default CSP permits inline scripts/styles and embedded data assets but rejects
remote scripts, styles, images, fonts, network connections, forms, plugins, and eval.
The exact policy lives in `src/security/policy.ts` and the Terraform response-header
policy. A meta policy travels with the document; `frame-ancestors` must also be
provided as an HTTP header. Deliver `X-Frame-Options: DENY` to protect the outer
viewer. These headers are hosting requirements, not HTTP headers supplied by an
S3 artifact upload. Every delivery path must enforce them, including a private
ALB reached through split DNS that bypasses the CDN. A VPN does not prevent
cross-origin framing by a website visited in a VPN-connected browser. Check
actual responses and browser framing behavior on both paths; see the
[split-DNS verification procedure](deployment/cloudfront.md#verify-each-delivery-path).

This is **not** a guarantee that hostile HTML is harmless. A malicious document can
mislead its viewer, offer harmful downloads, or entice outbound navigation. Popups
are deliberately enabled to make normal document links usable. Browser defects,
user actions, and data in approved external navigation remain outside this boundary.
Do not publish untrusted HTML into a trusted product's origin. Use a dedicated
artifact hostname with no authentication cookies, administrative interfaces, or
sibling applications relying on that origin's trust.

Markdown is parsed with Marked and sanitized with sanitize-html. Raw HTML is shown
as text, images are omitted, and unsafe or relative file links are downgraded to
text. Markdown does not gain arbitrary script execution. The secret scanner is a
separate, best-effort safeguard; it is not the sanitizer.

## Self-contained means self-contained

V1 publishes one file only. It does not discover/upload adjacent assets, bundle
scripts, fetch URLs, or deploy directories. Inline CSS/JS and data-URI assets are
appropriate. Remote fonts, CDN libraries, relative image paths, and `fetch()` calls
will not work under the default policy. HTML is not rewritten into a functioning
multi-file site. Warnings identify obvious external references but are not a full
JavaScript/CSS analyzer; the browser policy is the actual enforcement layer.

Do not loosen CSP globally just to make one artifact work. Bundle that artifact
properly, or deliberately design and review a broader hosting mode later.

## Public mode

`--no-encrypt` is an explicit confidentiality downgrade; `--public` is its legacy
alias, not a routing flag. The original document is
base64-encoded inside the same safe viewer shell to avoid script-tag termination
bugs. **Base64 is not encryption. Anyone can decode it without a password.**

Infrastructure can separately restrict who receives the viewer. A `/public/`
directory does not disable encryption, and an `internal/` name does not enforce
authentication. See the [route policy examples](deployment/bucket-layout.md).

The scanner checks both body text and title, including the filename-derived
default title and an explicit `--title`. It warns for protected publishing and
blocks any finding in public mode unless `--allow-secrets` is explicitly supplied.
There is no severity threshold. `--strict-secrets` blocks matches in protected mode
too and cannot be combined with `--allow-secrets`. Findings identify their `body`
or `title` source, rule names, and line numbers, never matched secret values.
False negatives and false positives are possible. Warnings collected before a
later failure remain in the failure envelope and stderr diagnostics.

## Local state and output

The publish result intentionally contains the password. So does an explicit
`list --show-passwords` when a matching local receipt exists, or
`receipts <slug> --show-passwords` for a local inventory. Treat command stdout,
saved JSON, terminal scrollback, agent transcripts, and screenshots accordingly.
Diagnostics do not include passwords or raw SDK error text. Direct `--password`
can expose the secret in process arguments; prefer a private file or environment
variable supplied by a secret manager.

Local receipts are private plaintext files, not a password vault. They are written
before a protected upload because the server may accept a PUT whose response is
lost. Failed attempts can therefore leave prepared receipts. Body-digest identity
keeps a stale receipt from being attached to a different remote revision. Old
receipts are retained through overwrites so a failed/conflicting replacement does
not destroy the previous password.

Receipt writes sync file contents and attempt to sync parent directory entries
after atomic rename/link and directory creation. Directory sync is best effort
where unsupported and is skipped on Windows; other I/O failures remain errors.
This improves persistence but does not establish tested power-loss durability.

`receipts <slug>` inspects local metadata only. Neither `prepared` nor `published`
proves an artifact is live, absent, or orphaned. Forgetting one exact body-digest
receipt requires `--forget <body-sha256> --force`; a `--dry-run` preview needs no
force. This may erase the only password for a live artifact or retained copy.
There is no automatic age-based or orphan cleanup. Follow the
[recovery guide](recovery.md) and obtain informed consent before deletion.

Deletion removes only the receipt for the observed remote body digest. Other
revision receipts remain, including prepared receipts from concurrent or uncertain
uploads. Reads and deletes validate the state root, deployment, and slug directories
before accessing a receipt; they never recursively delete a slug directory.
The user account and ancestors above the configured state root must be trusted.
These checks do not claim to prevent a malicious process running as the same user
from replacing paths concurrently. Windows ACLs require user administration and
have not been qualified by the macOS checks.

No browser password/key is persisted by the viewer. Lock reloads the page and
removes the visible document, but it is not a memory-erasure guarantee. Browser
extensions, the machine, and anyone with the password remain trusted.

## Replacement, deletion, expiry

New objects use `If-None-Match: *`. Overwrites require an explicit slug and
`--overwrite`, and use the observed ETag in `If-Match`. Delete uses the observed
ETag too. Unrecognized objects are not overwritten/deleted, and no operation
silently falls back to an unconditional request.

HEAD 403 triggers an exact-key prefix-scoped list to prove absence only when the
response is successful, untruncated, and lacks the exact key. That fallback never
proves ownership. Recognition requires valid Exhibit metadata and an ETag from
HEAD, including canonical UTC timestamps in `YYYY-MM-DDTHH:mm:ss.sssZ` form with
valid calendar values. Other date formats are rejected as `E_NOT_MANAGED`.
A PUT that returns no ETag is uncertain `E_STORAGE`: retain prepared receipts
because the write may already have succeeded.
An absent-object response to conditional DELETE requires a subsequent successful,
complete exact-prefix listing before local receipt cleanup. A proxy 404 alone cannot discard a
password while the artifact may still exist.

Reference cache TTLs are zero and responses use `no-store`. That improves freshness,
not cryptographic revocation. Saved ciphertext remains decryptable with the old
password. Changing a password and re-uploading does not change earlier copies.
Deleting an object does not remove copies or noncurrent S3 versions retained by an
existing bucket. S3 versioning is not enabled by the example; existing installations
must deliberately decide their version-retention policy.

There is no expiry flag or burn-after-read promise in v1. Client-side dates would
be bypassable, and scheduled deletion is not instantaneous access revocation.

## Hosting is part of the trust boundary

Encryption protects against storage readers who obtain ciphertext without the
password. It does not protect against a compromised CDN/operator modifying the
HTML/JavaScript delivered before the password is entered. That attacker could
replace the gate with credential-exfiltrating code. TLS, least-privilege publishing,
secure origins, dependency integrity, and deployment review still matter.

S3 server-side encryption is separate from document encryption. It does not make
an otherwise public plaintext artifact password-protected. `noindex` and opaque
URLs are discovery controls, not authorization.

## Before sensitive use

Run the installed dependency checks and the browser suite, validate/plan Terraform,
and exercise `doctor --probe` and a manual private-window unlock against the real
CDN. Review [verification](../engineering/verification.md). No real AWS deployment or
independent audit is implied by the source archive.
