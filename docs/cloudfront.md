# CloudFront

## New deployment

Use [examples/terraform/aws](../examples/terraform/aws/README.md). It deploys a
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

Do not share this origin with application login/session cookies. Avoid a CDN
behavior that forwards user cookies, Authorization, or arbitrary query strings to
S3. The viewer has no server-side session.

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
