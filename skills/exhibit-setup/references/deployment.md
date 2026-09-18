---
title: 'Configure Exhibit delivery'
description: 'Connect existing storage and verify viewer routing, headers, and access boundaries.'
---

# Configure Exhibit delivery

Use an already verified Exhibit CLI; `xbt` and `exhibit` are aliases. Substitute
the verified executable in examples. Confirm available flags with `xbt --help --json`.
Prefer the organization's existing bucket, CDN, identity, and network controls.
Agree on the destination and audience before changing configuration. This guide
describes required behavior; it does not assert that any deployment exists.

## Configuration and paths

Replace the bucket and hostname with approved values and store this non-secret
JSON at an agreed local path, passed explicitly through `--config`:

```json
{
  "schemaVersion": 1,
  "storage": {
    "provider": "s3",
    "bucket": "replace-me-artifacts",
    "region": "us-east-1",
    "prefix": "exhibits/",
    "forcePathStyle": false
  },
  "publicBaseUrl": "https://share.example.com",
  "maxInputBytes": 2097152,
  "brand": {
    "name": "Example Organization",
    "accent": "#1459a6"
  }
}
```

`brand` is optional; defaults are `Exhibit` and `#0f766e`. Its name is visible
before unlock, so keep it non-confidential. `maxInputBytes` is optional and defaults
to 2 MiB. For S3-compatible storage, optional `storage.endpoint` identifies the
storage API, not the viewer URL; choose region and path style for that provider.
URLs require HTTPS except loopback development and must not contain credentials,
query strings, or fragments. Never put access keys in this configuration.

The viewer URL root must map to the storage prefix exactly once. With the template,
CloudFront's origin path is `/exhibits`; any private ALB route must perform the
equivalent mapping. `--dir` appends a relative path to both configured roots:

| Scope, with slug `review`    | Object key                                  | Viewer URL                                                   |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| No `--dir`                   | `exhibits/review.html`                      | `https://share.example.com/review.html`                      |
| `--dir projects/demo`        | `exhibits/projects/demo/review.html`        | `https://share.example.com/projects/demo/review.html`        |
| `--dir public/projects/demo` | `exhibits/public/projects/demo/review.html` | `https://share.example.com/public/projects/demo/review.html` |

Do not repeat `exhibits/` in `--dir`, or duplicate the prefix in both the URL path
and the origin rewrite. If no rewrite exists, include the storage prefix in the
URL base instead. Use the same config and `--dir` for publication, listing,
overwrite, and removal. `xbt doctor` does not accept `--dir`.

## Infrastructure and audience

Keep S3 private with public access blocked and ACLs disabled. For CloudFront,
use the regional REST origin and OAC signed reads scoped to the distribution
and prefix. Preserve the existing owner of shared bucket policies; review KMS,
endpoint policies, and alternate hostnames where applicable. Use the AWS SDK's
normal credential provider chain, such as an existing profile/SSO session or role.
Grant publishers prefix-scoped `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, and
`s3:DeleteObject`, without broad administrative permissions. Viewers receive no
publisher credentials. Require create-only writes and ETag-conditional overwrite
and delete support; do not bypass failed conditions with unconditional retries.

Encryption and audience access are separate. Encryption is on by default in every
directory. `--no-encrypt` (legacy alias `--public`) makes content readable without
an artifact password; it does not select `/public/` or bypass infrastructure auth.
Directory names and `publicBaseUrl` do not enforce access controls. Failed
encryption must never become plaintext publication.

One organization policy is: public DNS routes through CloudFront, exempting only
`/public/` descendants from Basic Auth; every other route is gated. VPN/private
DNS routes through a network-restricted internal ALB to the same objects without
Basic Auth. Gate bare `/public` and public-looking siblings such as `/publicity/`.
Apply authentication before cached/origin delivery, never forward viewer Basic
Auth credentials to S3, and check alternate routes for bypasses.

Infrastructure, IAM, DNS/CDN changes, and deployment require explicit approval;
never run Terraform apply merely to complete setup. For an optional greenfield
reference, only after the CLI is installed and verified, run
`exhibit --version --json` and inspect the local directory returned in
`data.resources.terraform`. It is not required for an existing deployment. That
example creates new infrastructure and includes no VPN or Basic Auth gates; it
does not adopt an existing bucket automatically.

## Delivery headers

Use HTTPS and GET/HEAD viewer access. Set CDN minimum/default/maximum TTLs to zero
and preserve inline HTML with the following response headers on **both public
CloudFront and private ALB delivery paths**:

```text
Content-Type: text/html; charset=utf-8
Content-Disposition: inline
Cache-Control: no-store, max-age=0
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data: blob:; frame-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Robots-Tag: noindex, nofollow
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

The CSP literal above matches Exhibit policy. Inline scripts/styles and the
sandboxed viewer frame are required; external assets and network requests are
blocked. Keep standalone HTML self-contained. Do not replace this with a blanket
`default-src 'none'` alone. `frame-ancestors 'none'` must be an HTTP header; a meta
tag cannot enforce it. The private ALB bypasses CloudFront's response headers and
must supply its own anti-framing policy, even for VPN clients. Review the effect
of header changes on other applications sharing a listener.

## Verify the actual routes

With the approved target config and credentials known, start read-only:

```bash
xbt doctor --config ./exhibit-config.json --json
```

This checks config and signed prefix listing, not browser access or authentication.
Only after explicit write/delete probe approval:

```bash
xbt doctor --probe --config ./exhibit-config.json --json
```

The probe writes an encrypted non-sensitive fixture, fetches exact bytes, checks
inline delivery/headers and conditional operations, then attempts cleanup. On a
successful envelope inspect `data.healthy`, `data.checks`, and `data.cleanup_key`.
For `E_DOCTOR`, inspect `error.details.checks` and `error.details.cleanup_key`.
Review header warnings even when `ok` is true. Require confirmed cleanup or review
the reported key for authorized recovery.

The probe cannot send Basic Auth credentials. With the gated-root policy, run the
normal config on the VPN/private DNS path. An off-VPN root probe may fail at the
auth gate even when S3 writes work. For an approved off-VPN public probe, create a
separate config retaining the template's other settings but changing **both**
`storage.prefix` to `exhibits/public/` and `publicBaseUrl` to
`https://share.example.com/public`, then run:

```bash
xbt doctor --probe --config ./exhibit-public-probe.json --json
```

This still requires write/delete approval and does not verify Basic Auth. Do not
add `--dir` or credentials to the probe URL/config.

Publish non-sensitive test artifacts only with authorization. Verify the intended
policy using actual DNS resolution and requests:

| Client                    | `/public/...`   | Other paths                        |
| ------------------------- | --------------- | ---------------------------------- |
| Off VPN, no Basic Auth    | Delivers viewer | Denies delivery                    |
| Off VPN, valid Basic Auth | Delivers viewer | Delivers viewer                    |
| VPN with private DNS      | Delivers viewer | Delivers viewer without Basic Auth |

Test bare `/public`, encoded paths, dot segments, duplicate slashes, and alternate
hostnames for unintended access. In real browsers on both delivery paths, verify
wrong/right passwords, lock/reload, standalone HTML interaction, blocked external
requests, response headers, and cross-origin framing rejection. Check authorized
replacement/removal freshness and an explicitly approved unencrypted fixture
separately. Probe success does not establish browser or access-policy correctness.
No-store and deletion cannot revoke downloaded copies or old S3 object versions.
