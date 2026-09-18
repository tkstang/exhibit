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

## Actual crypto source used in offline checks

The temporary verification harness used these exact upstream Git blobs, with
Git object SHA-1 calculated from `blob <length>\0<bytes>` and matched before use:

| Path                  | Bytes | Git blob SHA                               |
| --------------------- | ----: | ------------------------------------------ |
| `lib/cryptoEngine.js` |  7776 | `db81afd43f95c49e522ad33075728eb16da8d9e7` |
| `lib/codec.js`        |  3960 | `1772181fce9748e2808fde7c146b6a4f7937fe0b` |

Those temporary source copies are not shipped as an alternative dependency. The
application requires the pinned `staticrypt` package from its normal installation.

Repository source metadata is not a resolved npm package installation. Package
registry resolution, dependency audit, Node24/TS7/Oxc/Vitest validation, and provider
Terraform validation remain local release tasks when unavailable in the creation
environment. See [VERIFICATION.md](../VERIFICATION.md) for executed results rather
than inferring them from this references list.
