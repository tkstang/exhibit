---
name: exhibit-setup
description: Set up the Exhibit CLI with an existing S3/CDN deployment or guide a reviewed new private-S3 and CloudFront Terraform deployment. Configure the client, check permissions and headers, and verify a non-sensitive artifact.
license: MIT
metadata:
  author: Thomas Stang
  version: '0.1.0'
---

# Set up Exhibit

Docs are authoritative; this skill coordinates setup without duplicating provider
configuration. Never provision resources or weaken bucket protections silently.

## Find the installation

Try `exhibit --version --json` or `xbt --version --json`. Use
`data.resources.docs` and `data.resources.terraform` for the canonical files.
When starting from source, read its README, `VERIFICATION.md`, and
`docs/development.md`, install the pinned toolchain, run local checks, and build
before linking the binaries. Do not assume an npm release exists.

## Determine the existing environment

Ask only for genuinely missing choices: existing/new infrastructure, bucket,
region, dedicated hostname/base URL, and how the CDN maps its origin prefix.
Read existing non-secret config and authorized infrastructure files first when they
can answer those questions. Never request credentials in chat or put them in JSON.

Choose the appropriate documentation path:

- Existing AWS S3 + CloudFront: `s3.md`, `cloudfront.md`, `configuration.md`.
- Existing S3 + Fastly: `s3.md`, `fastly.md`; preserve the existing reviewed signing model.
- New AWS stack: reference Terraform README, then a reviewed plan.
- S3-compatible provider: `s3-compatible.md`; endpoint configuration alone is not private-CDN provisioning.

For mixed public/internal access, read `bucket-layout.md` and the split-DNS
example in `cloudfront.md`. Confirm the route policy separately from encryption.
The primary example gates everything except `/public/` descendants. The shipped
new-bucket Terraform does not implement VPN or Basic Auth. Verify the viewer's
HTTP security headers on every delivery path, including an ALB that bypasses
CloudFront; a VPN is not a substitute for anti-framing protection.

Reuse safe existing infrastructure instead of creating a redundant stack. Keep
Block Public Access enabled. The publicly accessible layer delivers ciphertext;
it does not need a public bucket or viewer AWS credentials.

## Provision only with approval

Read and validate the Terraform example, choose an explicit account/workspace, and
produce a plan for review. Obtain permission before `terraform apply`, IAM grants,
DNS changes, or modifying existing CDN policies. No automatic destroy, forced
bucket emptying, role escalation, or plaintext access fallback.

The base example creates a new bucket and distribution. Custom domains use an
existing validated us-east-1 ACM certificate. Existing resources require import or
manual adaptation under review, not blind use of a new-resource example.

## Configure the client

Use `exhibit init` with all required flags, or use the Terraform non-secret config
output with `--config`. Check origin prefix/base URL mapping; never append the
prefix twice. The AWS SDK provider chain owns profile/role/environment credentials.
Do not create long-lived keys just to satisfy Exhibit.

## Verify

Start with read-only `exhibit doctor --json`. Once an active test is authorized,
run `exhibit doctor --probe --json`. Interpret every failed check and review header
warnings. A non-null `cleanup_key` needs identity-aware manual cleanup of that
specific non-sensitive probe. Do not claim the deployment passed while hiding it.

The probe checks the configured root, does not accept `--dir`, and cannot supply
Basic Auth credentials. For split DNS, follow `cloudfront.md` to test the normal
config on VPN and a reviewed public-subtree config off VPN. Both probes need
authorization. Separately test unauthorized/authorized gated requests and the
public exception. Do not weaken a gate to make a probe pass.

Publish one explicitly non-sensitive sample. Open the returned HTTPS URL in a fresh
browser window, check wrong/right passwords, Markdown layout, and standalone HTML
interactivity. Browser decryption and origin permissions are separate checks.

Report the configured hostname/prefix, tests actually run, warnings/remaining work,
and where the canonical config/docs live. Preserve default encrypted publication.
Do not include cloud credentials or unnecessary secret-bearing publication output
in a shared setup report.
