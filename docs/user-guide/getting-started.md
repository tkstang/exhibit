---
title: 'Getting started'
description: 'Install Exhibit, configure a destination, and publish a first artifact.'
---

# Getting started

## 1. Install and verify the CLI

Follow the [installation guide](installation.md) to install an approved built
archive with npm or pnpm, or build from an approved source checkout. Node 24 is
required; only source builds require the pinned pnpm toolchain. Then verify:

```bash
exhibit --version --json
xbt --version --json
```

Contributor checks are separate from CLI installation. See
[development](../engineering/development.md) for source validation.

## 2. Pick an infrastructure path

For a new AWS installation, use the [Terraform example](../../examples/terraform/aws/README.md).
For an existing S3 bucket and CDN, use [S3](deployment/s3.md) plus [CloudFront](deployment/cloudfront.md)
or [Fastly](deployment/fastly.md). Avoid creating a second distribution when a safe dedicated
artifact hostname can be added to existing infrastructure.

A publisher needs AWS credentials; a viewer does not. Viewers visit the CDN, not
the S3 website endpoint. Keep Block Public Access enabled.

## 3. Configure the client

```bash
exhibit init --bucket my-artifact-bucket --region us-east-1 \
  --prefix exhibit/ --public-base-url https://share.example.com
exhibit doctor --json
```

`init` writes local non-secret configuration only. It does not create a bucket,
change IAM, log into AWS, or deploy a CDN.

## 4. Verify the full route deliberately

```bash
exhibit doctor --probe --json
```

This creates a random non-sensitive encrypted probe, verifies public retrieval,
checks inline headers and conditional operations, and attempts cleanup even after
failure. A non-null `cleanup_key` means manual cleanup is needed. Review warnings:
a healthy result with warning-level header differences is not a security certification.

## 5. Publish an example

```bash
exhibit publish examples/artifacts/plan.md --json
```

Open the returned HTTPS URL in a private browser window. Before entering the
password, the source title/content should not be readable in the HTML source.
Enter the returned password; verify tables, code, and links. Then publish
`examples/artifacts/interactive.html` and exercise its slider.

Deliver the link/password through an appropriate channel. Sending both in one
message is convenient but offers no second-channel protection.

## 6. Manage the artifact

`exhibit list` queries remote storage. `--show-passwords` overlays only matching
local receipts. On another machine, the artifact will still list, but its password
will be absent unless receipts have been transferred securely.

`exhibit rm <slug>` deletes the current remote object and local receipts for that
slug. Downloaded copies and any retained object versions are outside that operation.
