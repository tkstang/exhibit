---
title: 'CloudFront and split DNS'
description: 'Configure signed origin reads and verify public and VPN delivery paths.'
---

# CloudFront

## New deployment

Use [examples/terraform/aws](../../../examples/terraform/aws/README.md). It deploys a
private regional S3 origin, CloudFront OAC signed reads, all-zero cache TTLs,
response security headers, HTTPS redirects, and GET/HEAD-only viewer behavior.

The default public URL is the distribution's `*.cloudfront.net` domain. The bucket
prefix is configured as the origin path, so `/review.html` maps to
`exhibit/review.html`. Extension-bearing keys intentionally avoid rewrite functions.
There is no directory listing or required root index page.

## Existing distribution

Add a dedicated hostname/distribution or carefully scoped behavior only after
reviewing origin trust and caching. Configure:

1. The bucket regional REST domain and the correct origin prefix.
2. OAC with always-on SigV4 signing and a bucket policy scoped to that distribution ARN.
3. Private bucket settings, no public ACL/policy and no website endpoint.
4. GET/HEAD-only behavior and HTTP-to-HTTPS redirect.
5. Zero minimum/default/maximum cache TTLs; otherwise CloudFront minimum TTL can
   undermine origin cache directives.
6. Security response headers matching `src/security/policy.ts`.

The Terraform example additionally emits `Strict-Transport-Security` (HSTS).
HSTS is not part of `src/security/policy.ts` and is not checked by `doctor --probe`;
verify it separately on the deployed HTTPS response. The example does not configure
CloudFront or S3 access logging; arrange any required logging and retention through
separately approved infrastructure changes.

Do not share this origin with application login/session cookies. Avoid a CDN
behavior that forwards user cookies, Authorization, or arbitrary query strings to
S3. The viewer has no server-side session.

## Split-DNS delivery example

An organization can reuse a private bucket and internal network while giving
Exhibit its own hostname. This design follows the
[public-directory-only policy](bucket-layout.md#public-directory-only). It is a
reference for adapting an existing stack, not additional deployable Terraform in
this package and not evidence that any access gate is live.

```text
share.example.com
  Public DNS -> CloudFront -> signed S3 origin reads
    /public/*: no infrastructure authentication
    all other paths: Basic Auth
  VPN/private DNS -> internal ALB -> S3 interface endpoint
    network-restricted access, no Basic Auth

Both paths: /projects/demo/review.html
        -> s3://replace-me-artifacts/exhibits/projects/demo/review.html
```

Use the [namespaced config](../../../examples/config/namespaced.json) with storage prefix
`exhibits/` and base URL `https://share.example.com`. CloudFront adds origin path
`/exhibits`; the ALB path rewrite adds the same prefix exactly once. The client
config and resulting URLs do not change when the publisher joins the VPN.
`publicBaseUrl` names the viewer URL base; it does not mean every path is public.

Keep the bucket private. Scope the new distribution's signed reads and publisher
permissions to the intended prefix. Preserve the existing stack's single owner
for its bucket policy, and review endpoint policies and alternate hostnames for
bypasses. A separate distribution must not accidentally expose existing archives.
Do not infer VPN membership from a viewer-supplied IP header.

Apply authentication before delivering cached or origin responses. Gate bare
`/public` and all unmatched paths; exempt only `/public/` descendants. Test encoded
paths, dot segments, duplicate slashes, and public-looking siblings such as
`/publicity/`. Never forward the viewer's Basic Auth credentials to S3.

The private ALB route bypasses CloudFront response headers. It must provide HTTP
`frame-ancestors 'none'` and `X-Frame-Options: DENY` independently.
VPN reachability does not prevent another website from framing the viewer in a
VPN-connected browser. Preserve inline HTML delivery and reviewed no-store/cache
behavior on both paths. ALB header insertion applies to all responses on the
listener, so review existing archive compatibility before changing a shared
listener. See [AWS header modification](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/header-modification.html).

The selected, not-yet-merged infrastructure proposal keeps the full
[viewer security-header policy](../security-model.md#browser-isolation-and-network-policy)
on CloudFront. Its shared ALB listener adds only anti-framing headers to avoid
applying Exhibit's restrictive CSP to unrelated archive pages:

| Response                                                          | CloudFront                                              | Shared ALB / VPN route                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| CSP                                                               | Full Exhibit policy, including `frame-ancestors 'none'` | `frame-ancestors 'none'` only; generated HTML retains its meta CSP |
| `X-Frame-Options`                                                 | `DENY`                                                  | `DENY`                                                             |
| `Cache-Control`                                                   | `no-store, max-age=0` policy override                   | Exhibit object header                                              |
| `X-Content-Type-Options`, `Referrer-Policy`, `X-Robots-Tag`, HSTS | Set by response policy                                  | Not added by this listener configuration                           |

This is a deliberate policy difference, not header parity. `xbt doctor --probe`
still warns for differences in the headers it checks; HSTS requires separate
inspection. Review warnings rather than weakening the checks. Verify anti-framing and browser isolation on both routes
after deployment. Neither a Terraform change nor a successful npm release proves
that those routes are configured or reachable.

### Verify each delivery path

Start with read-only `exhibit --config ./exhibit-config.json doctor --json`.
It checks signed S3 listing, not browser reachability or route authentication.

After explicit authorization, run `doctor --probe` on the VPN using the normal
config to exercise the private delivery path. Off VPN, the same config probes a
gated root path and cannot supply Basic Auth credentials. A failed `public-read`
check in that situation is not by itself evidence of broken S3 writes. Inspect
the individual checks and require confirmed cleanup or review `cleanup_key`.

To probe public delivery off VPN, use a separate reviewed config with both roots
scoped to the public subtree, retaining the other deployment settings:

```json
{
  "schemaVersion": 1,
  "storage": {
    "provider": "s3",
    "bucket": "replace-me-artifacts",
    "region": "us-east-1",
    "prefix": "exhibits/public/",
    "forcePathStyle": false
  },
  "publicBaseUrl": "https://share.example.com/public"
}
```

Then, only with probe authorization:

```bash
exhibit --config ./exhibit-public-probe.json doctor --probe --json
```

This writes and conditionally deletes an encrypted non-sensitive fixture beneath
`exhibits/public/`. It does not verify Basic Auth or the remaining route policy.
`doctor` has no `--dir` option; do not add credentials to the URL or config.

For browser and access-policy qualification, publish authorized non-sensitive
fixtures in public and gated directories. Verify this matrix using actual DNS
resolution, not a VPN connection indicator alone:

| Client                    | `/public/...`   | Other paths                        |
| ------------------------- | --------------- | ---------------------------------- |
| Off VPN, no Basic Auth    | Delivers viewer | Denies delivery                    |
| Off VPN, valid Basic Auth | Delivers viewer | Delivers viewer                    |
| VPN with private DNS      | Delivers viewer | Delivers viewer without Basic Auth |

On both delivery paths, verify wrong/right artifact passwords, lock/reload,
standalone HTML interaction, security headers, cross-origin framing rejection,
and replacement/removal freshness. Check an explicitly authorized unencrypted
fixture separately. Encryption remains the default for every route. Neither a
matching probe digest nor a passing Terraform plan proves browser behavior.

## Custom domain

The reference example accepts an existing validated ACM certificate ARN in
`us-east-1` and an optional Route53 hosted zone ID. It can create A and AAAA aliases.
Certificate issuance/validation is intentionally not a hidden side effect of the
base example. Without Route53, create the appropriate DNS records with your provider.

A custom certificate uses the example's `TLSv1.2_2021` minimum policy. The default
CloudFront certificate follows CloudFront's default-certificate configuration;
do not describe it as the custom-domain TLS policy. HTTP is still redirected to
HTTPS in both modes.

## Changes and deletions

No CDN invalidation is needed for the reference zero-TTL configuration. Existing
installations with positive caches must purge or wait according to their policy.
Neither approach revokes a downloaded encrypted copy. Do not promise immediate
revocation, especially on a preexisting distribution with custom cache/error rules.

After propagation, use `exhibit doctor --probe --json`, then manually unlock the
sample under the real HTTPS URL. A matching response-body digest does not prove
browser CSP/decryption behavior; both checks are needed.

Official guidance: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
