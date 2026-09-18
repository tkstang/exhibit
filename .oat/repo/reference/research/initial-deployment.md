# Initial Exhibit Deployment Proposal

## Selected direction update, 2026-09-18

The first work deployment now targets the existing `vox-media-open-agent-toolkit`
bucket in `us-east-1`, prefix `exhibits/`, and dedicated hostname
`exhibits.voxops.net`. [Terraform PR #1841](https://github.com/voxmedia/terraform/pull/1841)
owns the adaptation; it was open when this update was written. No deployment or
live acceptance result is recorded here.

The selected route policy supersedes the original `/internal/` proposal below.
Only `/public/` descendants bypass Basic Auth on public DNS. Other routes require
Basic Auth off VPN; private DNS routes VPN/VPC clients through the internal ALB
without Basic Auth. Both delivery paths add the common `exhibits/` origin prefix
exactly once. Encryption stays on by default in every directory.

Generic documentation lives in [bucket layout](../../../../docs/bucket-layout.md)
and [CloudFront split DNS](../../../../docs/cloudfront.md#split-dns-delivery-example).
Organization-specific deployment values and AWS profile instructions belong in
the organization-owned wrapper skill's `references/exhibit-config.json` and
`SKILL.md`, not Exhibit's generic defaults. No credentials belong in either file.

The initial Terraform review found missing anti-framing response headers on the
VPN delivery path. Feedback was handed to the infrastructure agent; subsequent
fixes require their own verification. Do not infer resolution from this note or
from a passing Terraform plan. The same applies to live origin access, route
authentication, and browser behavior. The historical alternatives below remain
context, not current deployment instructions.

## Historical proposal, 2026-09-17

Status: source inspection and proposal, 2026-09-17. No cloud resources or external
access policies have been changed. This records the user's direction, not a finalized
infrastructure decision.

## Required Access Model

- Public URL paths serve encrypted exhibits without VPN or Basic Auth. A recipient
  needs the artifact password to decrypt, not an infrastructure credential.
- `/internal/...` is for work: VPN access OR Basic Auth is required before delivery.
  Exhibit still encrypts by default. Plaintext publication remains an explicit
  `--no-encrypt` choice (`--public` remains an alias), separate from whether the CDN route is public.
- Keep OAT project archives and published exhibits separate. Support repository,
  project, and standalone artifact namespaces without adding a service or database.

The transcript's sections around lines 1127-1169 and 2661-2689 describe the same
split. Its Mini context copy is `~/Downloads/exhibit-chat-context.md`; the original
is `~/Downloads/ChatGPT-Compare artifact hosting options-20260917-2324.md` on the laptop.

## Inspected Existing Resources

The laptop's `~/code/vox/terraform/voxmedia/Apps/open-agent-toolkit/` defines:

- Existing bucket `vox-media-open-agent-toolkit`, region `us-east-1`.
- Public `open-agent-toolkit.voxops.net` served by CloudFront OAC plus a viewer-request
  Basic Auth function. The current default behavior uses Managed-CachingOptimized.
- Private DNS for the same hostname points to an internal ALB and S3 interface
  endpoint, allowing VPN/VPC reads without Basic Auth.
- One Terraform-owned bucket policy permits both the distribution and the endpoint.

This specific target is CloudFront, despite Fastly being present elsewhere in the
Terraform repository. It is reusable; the new-resource example in Exhibit must not
be applied against these resources without an import/adaptation plan.

Laptop OAT configs for skills, stoa, and orc consistently use
`s3://tkstang-open-agent-toolkit/repositories`, profile `tkstang-artifact-sync`, region
`us-east-1`. Exhibit's `.oat/config.json` now mirrors the archive/workflow settings.
No archive sync ran. The personal bucket's Cloudflare routing, origin privacy, and
credentials were not inspected or tested; the archive URI alone does not establish
a safe browser-hosting configuration. Work content should remain in a reviewed work
account, rather than inheriting the personal archive destination automatically.

## Proposed Namespaces

For a personal bucket with only externally shareable encrypted exhibits, the user's
suggested shape works directly:

```text
tkstang-open-agent-toolkit/
  repositories/                       OAT archives, unchanged
  exhibits/
    repositories/<repo>/<slug>.html
    projects/<project>/<slug>.html
    standalone/<slug>.html
```

Explicit `standalone/` and `projects/` namespaces avoid collisions between repository
names and unrelated projects. Repo/project names are visible in URLs; use neutral
names where sensitive. Random artifact slugs remain the default.

For a bucket serving both access classes, reserve disjoint physical prefixes:

```text
exhibits/shared/repositories/<repo>/<slug>.html
exhibits/shared/projects/<project>/<slug>.html
exhibits/shared/standalone/<slug>.html
exhibits/internal/repositories/<repo>/<slug>.html
exhibits/internal/projects/<project>/<slug>.html
```

Example mapping for one dedicated hostname:

| Viewer path | S3 object key | Access before delivery |
| --- | --- | --- |
| `/repositories/demo/review.html` | `exhibits/shared/repositories/demo/review.html` | Anyone receives ciphertext |
| `/projects/review/design.html` | `exhibits/shared/projects/review/design.html` | Anyone receives ciphertext |
| `/internal/repositories/demo/review.html` | `exhibits/internal/repositories/demo/review.html` | VPN OR Basic Auth |

In CloudFront terms, the public origin path would be `/exhibits/shared`. The
`/internal/*` behavior would use an origin path of `/exhibits`, retaining the
`/internal` viewer segment exactly once. The internal behavior must keep auth;
the public behavior must never map to raw OAT archives. Handle bare `/internal`
explicitly. A dedicated public hostname with a separate distribution and prefix-scoped
OAC policy remains an alternative if reviewing same-host routing proves cumbersome.

## CLI Configuration Today

Updated 2026-09-18: `--dir` selects a relative directory beneath a configured
destination. There is no implicit repository detection. For a common `exhibits/`
origin prefix mapped to `https://share.example.com`, use:

```bash
xbt publish plan.md --dir repositories/demo --json
xbt publish plan.md --dir internal/repositories/demo --json
xbt list --dir internal/repositories/demo --json
```

Those commands target `exhibits/repositories/demo/` and
`exhibits/internal/repositories/demo/`, respectively. Both encrypt by default;
`--no-encrypt` is an independent, deliberate opt-out. This simpler common-root
mapping is an alternative to the disjoint `shared/` rewrite proposal above, not an
implemented CDN policy. Internal routes still need separately reviewed enforcement.

If adopting the disjoint `shared/` rewrite proposal above, use explicit config
files per access class because their origin roots differ. For the shared destination:

```json
{
  "storage": {
    "bucket": "reviewed-work-bucket",
    "region": "us-east-1",
    "prefix": "exhibits/shared/"
  },
  "publicBaseUrl": "https://share.example.com"
}
```

For the internal destination, use prefix
`exhibits/internal/` and base URL `https://share.example.com/internal`. Select either
with `xbt publish plan.md --config <reviewed-config.json> --dir repositories/demo --json`.
Slugs remain flat; `--dir` supplies hierarchy beneath the chosen root. `list` and
`remove` operate on that effective directory, not a recursive all-repositories inventory.

## Reviewable Deployment Work

1. Select the work bucket and dedicated hostname. Keep personal and work ownership
   explicit. Decide whether existing split DNS should be adapted or a dedicated
   public distribution should serve the sharing prefix.
2. Modify the owning Vox Terraform stack in a separate reviewed change. Preserve
   existing archive access, Basic Auth, VPN behavior, and the existing bucket-policy
   resource. Do not create a second competing bucket policy or deploy redundant
   bucket/ALB resources from Exhibit's greenfield example.
3. Define public/internal route-to-key mapping, origin permissions, publisher prefix
   permissions, no-store/zero-TTL behavior, CSP/security headers, and isolated auth
   handling. Never trust viewer-supplied forwarded-IP headers as VPN evidence.
4. Test normalized/encoded paths, duplicate slashes, alternate CDN hostnames, direct
   S3 access, and unrelated archive paths. Verify that no unauthenticated alias can
   reach the internal prefix. Exercise both public DNS and the VPN resolver path.
5. Present the actual Terraform plan for approval. Apply only after approval, then
   obtain explicit authorization for `doctor --probe` and publish one non-sensitive
   fixture. Test password entry, replacement/removal freshness, and internal auth
   from outside VPN and from VPN. `doctor` cannot by itself prove Basic Auth/VPN
   policy; internal public retrieval needs a VPN execution context or separate
   authenticated checks, since the CLI does not accept Basic Auth credentials.

Bucket/CDN policy cannot inspect Exhibit ciphertext semantics. The public route's
encrypted-only convention depends on using protected publication; `--no-encrypt` would
intentionally expose plaintext there. Do not claim that the path enforces encryption.
