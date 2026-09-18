---
title: 'Existing Fastly and S3'
description: 'Reuse a reviewed private-S3 origin and verify path mapping and delivery.'
---

# Existing Fastly + S3

Exhibit does not require CloudFront. The client uploads to S3 and returns the base
URL you configured; it is deliberately unaware of the CDN implementation.

Use your established, reviewed Fastly private-S3 origin authentication pattern.
**Fastly does not use CloudFront OAC.** If the current service only reaches S3
because the bucket is public, that is not the recommended private-origin setup.
Do not remove Block Public Access to make the example work.

## Deployment checklist

- Use a dedicated artifact hostname without app authentication cookies.
- Keep publisher AWS credentials separate from read-only origin credentials.
- Use the regional S3 REST backend over TLS, with the signing/Host/region settings
  required by your actual Fastly implementation.
- Map the viewer path to the selected S3 prefix exactly once.
- Permit public GET/HEAD for the **encrypted viewer route**, not public S3 writes.
- Preserve `text/html` and `inline` and apply no-store behavior at the edge.
- Apply the CSP and other headers from `src/security/policy.ts`.
- Do not forward client cookies, authorization, or arbitrary query strings to S3.
- Preserve Basic Auth/VPN protection on unrelated internal artifact routes.

This is a configuration checklist, not a claim that one pasted VCL snippet safely
covers every Fastly service. Origin-signing mechanisms differ across existing VCL
and Compute deployments. Review the installed service's current private-S3
implementation and provider documentation before changing it. No Fastly resources
are managed by the AWS Terraform example.

## Configure Exhibit

```bash
exhibit init --bucket my-artifact-bucket --region us-east-1 \
  --prefix exhibit/ --public-base-url https://share.example.com
exhibit doctor --json
exhibit doctor --probe --json
```

When Fastly already maps `/` to `exhibit/`, do not add `/exhibit` to the public base
URL too. For a pass-through path, include the prefix in the public base URL instead.

Test a protected standalone HTML example in a fresh browser window. An encrypted
page behind blanket Basic Auth will still require that Basic Auth before the viewer
can receive ciphertext; encryption does not bypass an existing infrastructure gate.
