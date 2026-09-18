---
title: Verification and support boundaries
description: Reproduce local checks and distinguish tested behavior from deployment qualification.
---

# Verification and support boundaries

## Tested baseline

The installed-toolchain baseline was checked on macOS arm64 with Node 24.18.0
and pnpm 11.8.0 on 2026-09-18. Local checks passed for strict types, lint/contracts,
formatting, build, 110 Vitest tests in 20 files, and 12 real HTTP Chromium tests.
Package verification checks the packed resources, both binary entrypoints, and
an encrypted viewer rendered from the extracted package.

Eight additional Node tests check skill bundle parity, isolated relocation,
reference closure, stale-output detection, symlink refusal, and setup contract
details. Package verification also checks every standalone/plugin bundle byte
against its source-derived output and relocates each packed skill independently.
These checks do not establish installation or discovery in a live agent host.

Eleven Node release tests cover metadata/tag checks, changelog extraction, archive
and notes integrity, registry error handling, and real temporary Git histories.
Local release dry runs also install the actual archive with npm outside the source
checkout and verify both executable aliases. New versions receive a non-publishing
npm dry run; existing-version recovery checks registry integrity instead.
Live npm OIDC publication and GitHub Release creation remain unverified.

The browser suite uses desktop and mobile viewport sizes. It covers correct/wrong
passwords, tampering, source isolation, blocked network access, inline HTML
interaction, lock/reload, plaintext mode, and layout. Mobile Chromium viewport
coverage is not native Safari or Android qualification.

SDK tests exercise conditional PUT/DELETE against a loopback HTTP fixture. Crypto
tests use actual pinned StatiCrypt, not a substitute cipher. These checks do not
contact a live storage provider. Reference Terraform formatting and validation
have passed locally; no apply or deployment acceptance is implied.

## Reproduce the checks

Use the version in `.nvmrc` and the package manager pinned in `package.json`.
From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:browser
pnpm test:package
```

For the reference infrastructure:

```bash
cd examples/terraform/aws
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

`pnpm worktree:validate` runs the application, browser, and package gates and
requires a clean tree before and after. PR CI also initializes and validates the
Terraform example on Linux. Check the actual PR status rather than treating a
local result as a CI result. See [development](development.md).

## Not yet qualified

- Live S3/CDN/DNS delivery, VPN/Basic Auth rules, alternate-route bypasses, and
  response-header parity on the target deployment.
- Authorized non-sensitive publication and active probes, with confirmed cleanup
  and browser checks on both public and VPN paths.
- Windows ACL/junction behavior and native-device browsers.
- Power-loss durability and adversarial filesystem changes by the same local user.

This project has not received an independent security audit. Read the
[security model](../user-guide/security-model.md) and
[delivery-path checklist](../user-guide/deployment/cloudfront.md#verify-each-delivery-path)
before relying on a deployment for sensitive content. A successful probe digest
does not prove browser isolation or route authentication.

Source merge, npm release, and deployment acceptance are separate decisions.
Keep `private: true` until publication is approved. Historical source-generation
checks and import handoffs remain in Git history; they are not current acceptance
evidence and are not shipped as operational instructions.
