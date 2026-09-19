# Changelog

These are reviewed release notes. A section here does not mean that version has
been published; check npm and GitHub Releases for publication status.

## [Unreleased]

## [0.1.0]

### Added

- Publish one Markdown or standalone HTML file to S3-compatible storage with
  browser-local decryption and password protection enabled by default.
- Use either `exhibit` or `xbt` for publication, listing, exact-object removal,
  configuration, and connection checks.
- Choose a destination with `--dir` independently of encryption. Use
  `--no-encrypt` only for deliberately unencrypted publication.
- Use conditional writes/deletes and local password receipts to handle conflicts
  and uncertain uploads without unconditional retries.
- Inspect retained local receipts with `receipts <slug>` and deliberately forget
  one exact digest only with explicit acknowledgement of password loss.
- Retain recovery receipts when deletion is only inferred from a provider listing,
  and provide human-readable local inventory and repair guidance.
- Keep fragment links inside Markdown and HTML viewers without relaxing isolation.
- Preserve warnings on failed operations, scan rendered titles and document bodies,
  and report dry-run remote checks as unperformed.
- Distribute publishing/setup skills as self-contained standalone or plugin
  bundles, with CLI availability checks and installation guidance.
- Configure private S3/CDN hosting using deployment guides, a new-bucket Terraform
  reference, and an organization wrapper example.

### Limitations

- Live target S3/CDN deployment and VPN/Basic Auth enforcement are not yet qualified.
- Agent-host plugin discovery, Windows permissions, and native mobile browsers
  have not been qualified. Directory names alone do not enforce access controls.
- Deletion cannot revoke downloaded copies or older retained object versions.
- Fragment navigation is a best-effort helper, not a full hash router. Malformed
  HTML and some authored event-handling patterns require source adaptation; see
  the packaged security-model documentation for supported behavior and limits.
