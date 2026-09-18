---
title: 'Architecture'
description: 'Understand the CLI, rendering, storage, and local-state boundaries.'
---

# Architecture

```text
commands/run → typed use cases → renderer / protector / state / ArtifactStore
                                                         ↓
                                              S3 adapter → AWS SDK v3
```

One package is sufficient: CLI, library functions, viewer assets, docs, and skills
release together. `src/cli.ts` is the process boundary. `commands/run.ts` forms
structured envelopes without printing. `commands/output.ts` alone formats human
results and sends diagnostics to stderr.

The publish use case reads one bounded UTF-8 file, derives presentation, runs the
secret scan, checks remote identity, produces a public/protected viewer, prepares
local password recovery state, and issues a conditional write. The artifact storage
interface is a testable seam, not a plugin registry. `storage/aws.ts` is the only
provider-SDK binding.

`render/markdown.ts` uses Marked and sanitize-html. `render/html.ts` preserves
standalone document semantics. `render/viewer.ts` embeds the supplied document into
an opaque-origin frame, either after upstream decryption or after base64 decoding
of explicitly public bytes. Assets remain plain HTML/CSS/JS, with no React build
or app server required.

`security/staticrypt.ts` isolates the pinned upstream deep imports. This avoids
subprocess argument leaks and temporary plaintext files without reimplementing
cryptography. The upstream browser code and full MIT notice travel with protected
HTML. Test its adapter and generated browser surface together when upgrading.

Remote metadata is authoritative for listing, overwrite identity, and deletion.
Local receipts store only per-machine facts and recovery information. A digest of
the uploaded body disambiguates concurrent/failed revisions while ETags protect
remote mutations. There is deliberately no global mutable local manifest or index
object for all publications.

## Failure order

1. Parse options/config and reject unsafe file/slug/password inputs.
2. Read/render/scan; dry run stops here without S3 requests.
3. Read current remote identity and reject implicit overwrites.
4. Encrypt and prepare a private receipt before the network write.
5. Perform a create-only or ETag-conditional write.
6. Mark local state published; return a success with a warning if only this final
   local bookkeeping step fails.

A failed request is not proof of an absent remote object. Inspect its slug before
retrying. Never delete unrelated data to make a retry succeed.

The `doctor` probe has a separate marked object kind and random slug. Its cleanup
checks current identity before a conditional delete and reports uncertain cleanup
rather than hiding it. No service or cron process is deployed by the CLI.
