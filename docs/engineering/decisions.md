---
title: 'Implementation decisions'
description: 'Rationale for the package structure, crypto adapter, rendering, and lifecycle.'
---

# Implementation decisions

## Keep it small

Single package, a small CLI command surface, and plain viewer assets. No monorepo,
MCP, host provisioning API, account system, or OAT runtime dependency. Skills call
the CLI. Named Node import maps plus matching TypeScript/Vitest aliases avoid a
post-build alias-rewriting dependency.

## Use the real crypto library

Pin StatiCrypt 3.5.4 and call its existing engine/codec. Embed unchanged upstream
browser code. This uses a private deep-import surface, so a future upgrade must be
intentional. It avoids CLI subprocess arguments and disk plaintext. It is not a
claim that upstream or Exhibit has been independently audited.

## Public and protected share a viewer

Preserve arbitrary standalone HTML without letting it directly execute in the
parent UI. An opaque-origin iframe creates the isolation boundary. Public HTML is
base64-encoded only for safe transport inside a script-data field, never called
protected. Protected gate metadata is generic.

## Choose Marked plus a sanitizer

GFM parsing and HTML sanitization are separate responsibilities. Marked supplies
predictable GFM rendering and hooks; sanitize-html applies an explicit tag/attribute
policy. Raw HTML inside Markdown is escaped, images are omitted in single-file mode,
and safe absolute links open outside the sandbox. This costs two focused runtime
dependencies instead of building a sanitizer or introducing a larger pipeline.
Installed-dependency rendering checks are part of the [verification gate](verification.md).

## No hidden overwrites or revocation claims

Opaque URLs by default; explicit named slugs and `--overwrite` for stable links.
Conditional writes/deletes guard races. Zero-TTL/no-store delivery favors freshness
over caching because artifacts are small review documents, not a high-volume site.
Offline copies remain valid. Expiration is deliberately absent rather than a fake
client-side access control.

## Local-only secret receipts

Persist passwords before an uncertain PUT and key receipts by remote-body digest.
Do not replace a single per-slug password prematurely. Reading S3 remains necessary
for management. `--show-passwords` is explicit. `--no-store-password` allows an
intentionally ephemeral workflow but reports its recovery limitation.

Receipt inspection is local-only; local status does not classify remote orphans.
Forgetting requires an exact body digest and explicit acknowledgement of password
loss. There is no automatic age-based cleanup. File and supported directory syncs
improve persistence without claiming qualified power-loss durability.

## Generated passwords, deliberate public exceptions

Generated passwords are high-entropy random values; custom passwords receive a
minimum length check, not a false strength guarantee. Protected content with secret
matches warns by default as requested. Public content with matches blocks unless
explicitly acknowledged, and strict mode is available for both.

## Doctor is honest about mutation

Read-only by default, opt-in `--probe` for a write/fetch/delete and conditional-capability
check. The setup skill requires approval before deploying infrastructure and treats
the probe as a real mutation. No write/delete permissions are secretly tested in a
command presented as read-only.

## Dependency currency

Foundations' runtime/toolchain conventions informed the Node 24, TypeScript 7,
pnpm 11, Zod 4, Vitest 4, and Oxc setup. The genuine committed lockfile and frozen
CI install make dependency resolution reproducible. AWS SDK and StatiCrypt pins
require intentional review before changing. See [sources](sources.md) and
[verification](verification.md) for references and tested boundaries.
