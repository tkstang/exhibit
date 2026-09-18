---
title: 'Source references'
description: 'Upstream projects and documentation that informed the implementation.'
---

# Source references and validation boundaries

Implementation inputs were checked on 2026-09-17.

- Foundations conventions and the single-package scaffold were read through the
  connected private repository. They informed project shape and CLI conventions;
  private mining evidence was not copied into this repository.
- Hushdrop behavioral reference: https://github.com/maxtechera/hushdrop
- StatiCrypt source/API: https://github.com/robinmoisson/staticrypt
- StatiCrypt license: https://github.com/robinmoisson/staticrypt/blob/main/LICENSE
- AWS SDK package metadata: https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-s3/package.json
- S3 conditional writes: https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
- S3 conditional deletion: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
- Private CloudFront S3 origins: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- Marked renderer extension API: https://marked.js.org/using_pro
- Agent Skills format: https://agentskills.io/specification
- TypeScript release information: https://devblogs.microsoft.com/typescript/
- pnpm installation: https://pnpm.io/installation

## Attribution and verification

Hushdrop inspired the workflow; Exhibit does not redistribute its source files.
Protected artifacts embed the pinned StatiCrypt browser implementation and its
license. See [third-party notices](../../THIRD-PARTY-NOTICES.md) for attribution.

Source references are not acceptance evidence. See [verification](verification.md)
for tested environments, reproducible checks, and remaining deployment work.
Historical source-generation checks remain in Git history.
