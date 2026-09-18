# Proposed bucket layout

These are proposed ways to organize Exhibit artifacts, not required layouts or deployed
access policies. The CLI supports these paths today. Your hosting infrastructure must
provide and verify any VPN or Basic Auth restrictions before you rely on them.

## One root for exhibits

Reserve `exhibits/` for published artifacts. If the bucket also holds OAT archives,
keep those in their existing namespace outside the viewer's origin prefix:

```text
s3://replace-me-artifacts/
  repositories/                              Existing OAT archives, not viewer content
  exhibits/
    repositories/<repo-name>/<slug>.html
    projects/<project-name>/<slug>.html
    standalone/<slug>.html
    internal/
      repositories/<repo-name>/<slug>.html
      projects/<project-name>/<slug>.html
      standalone/<slug>.html
```

Use `repositories/` for repo-related documents, `projects/` for work that spans or
does not belong to a repo, and `standalone/` for individual files. These names are
conventions, not reserved CLI keywords. A shorter `exhibits/<project>/<slug>.html`
layout also works. Explicit namespaces avoid project/repository name collisions.

S3 directories here are object-key prefixes. Exhibit still publishes one Markdown
or standalone HTML file per command; it does not upload a source directory.
Directory names appear in URLs and storage keys, so choose names that can be
disclosed. Omit `--slug` for the default random artifact name.

Sharing a bucket does not grant Exhibit authority to manage archives. Scope the
publisher's permissions and viewer origin access to the intended exhibit prefixes.
Keep work and personal content in their approved accounts or buckets; this layout
is not a reason to combine those ownership boundaries.

## Match the storage root and URL

The [namespaced config example](../examples/config/namespaced.json) uses:

```json
{
  "schemaVersion": 1,
  "storage": {
    "provider": "s3",
    "bucket": "replace-me-artifacts",
    "region": "us-east-1",
    "prefix": "exhibits/",
    "forcePathStyle": false
  },
  "publicBaseUrl": "https://share.example.com"
}
```

The bucket and hostname are placeholders. For this proposal, the CDN maps viewer
paths beneath `https://share.example.com/` to keys beneath `exhibits/` exactly once.
`--dir` appends the same relative path to each configured root:

| `--dir`                      | Object key with `--slug review`                   | Viewer URL                                                         |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| omitted                      | `exhibits/review.html`                            | `https://share.example.com/review.html`                            |
| `repositories/exhibit`       | `exhibits/repositories/exhibit/review.html`       | `https://share.example.com/repositories/exhibit/review.html`       |
| `projects/redesign`          | `exhibits/projects/redesign/review.html`          | `https://share.example.com/projects/redesign/review.html`          |
| `standalone`                 | `exhibits/standalone/review.html`                 | `https://share.example.com/standalone/review.html`                 |
| `internal/projects/redesign` | `exhibits/internal/projects/redesign/review.html` | `https://share.example.com/internal/projects/redesign/review.html` |

Do not put `exhibits/` in `--dir` when the config already includes it. Existing
deployments using the default `exhibit/` prefix do not need to rename anything;
the same relative directory convention works under that root.

## Keep routing and encryption separate

The first proposed delivery policy has two route classes. The
[public-directory alternative](#alternative-public-directory-only) below reverses
which routes require infrastructure authentication; choose one policy per deployment.

- Paths outside `/internal/` require no VPN or Basic Auth. Recipients receive an
  encrypted page and use its Exhibit password to read it.
- `/internal/...` requires VPN access or Basic Auth before delivery. Exhibit still
  encrypts the page by default. Use `--no-encrypt` only when deliberately relying
  on the verified infrastructure gate without a separate artifact password.

| Route                                           | Default                                              | With `--no-encrypt`          |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Outside `/internal/`                            | Anyone can fetch ciphertext; password needed to read | Anyone can read the document |
| `/internal/...` with the proposed gate enforced | VPN or Basic Auth, then artifact password            | VPN or Basic Auth only       |

`--public` remains an alias for `--no-encrypt`. Neither flag changes routing or
bucket policy. A directory named `internal` has no special meaning to Exhibit.
The CDN does not enforce the convention that externally shareable artifacts are
encrypted; a publisher choosing `--no-encrypt` there exposes readable content.

## CLI examples

After adapting the example config to your reviewed deployment:

```bash
# Preview the mapping without network requests or publication.
xbt --config ./exhibit-config.json publish plan.md \
  --dir repositories/exhibit --slug review --dry-run --json

# Publish an encrypted artifact with a fresh random slug and password.
xbt --config ./exhibit-config.json publish plan.md \
  --dir repositories/exhibit --json

# An internal path still encrypts by default.
xbt --config ./exhibit-config.json publish report.html \
  --dir internal/projects/redesign --json

# Skip encryption only after verifying the internal access gate.
xbt --config ./exhibit-config.json publish report.html \
  --dir internal/projects/redesign --no-encrypt --json

xbt --config ./exhibit-config.json list --dir internal/projects/redesign --json
```

Reuse the same `--dir` for `list`, `remove`/`rm`, and explicit overwrites. Use the
returned slug when managing the artifact. `list` shows immediate artifacts only;
listing the root does not inventory every repository or project. Receipts for
same-named artifacts in different directories remain separate.

## Alternative: public directory only

Instead of restricting only `/internal/`, require VPN access or Basic Auth for
every route except descendants of `/public/`. This makes external sharing an
explicit destination choice; the root and any new directories remain gated by
the default infrastructure policy.

With the same `exhibits/` root and [example config](../examples/config/namespaced.json):

```text
s3://replace-me-artifacts/exhibits/
  repositories/<repo-name>/<slug>.html         VPN or Basic Auth
  projects/<project-name>/<slug>.html           VPN or Basic Auth
  standalone/<slug>.html                       VPN or Basic Auth
  public/
    repositories/<repo-name>/<slug>.html       No VPN or Basic Auth
    projects/<project-name>/<slug>.html         No VPN or Basic Auth
    standalone/<slug>.html                     No VPN or Basic Auth
```

For example, `--dir public/repositories/exhibit --slug review` produces key
`exhibits/public/repositories/exhibit/review.html` and URL
`https://share.example.com/public/repositories/exhibit/review.html`.
`--dir repositories/exhibit` produces the corresponding gated path without
`public/`. Omitting `--dir` also targets a gated route under this proposal.

```bash
# Externally accessible route, still encrypted with an Exhibit password.
xbt --config ./exhibit-config.json publish plan.md \
  --dir public/repositories/exhibit --json

# Gated route, also encrypted by default.
xbt --config ./exhibit-config.json publish report.html \
  --dir projects/redesign --json

# Gated route without artifact encryption, after verifying the gate.
xbt --config ./exhibit-config.json publish report.html \
  --dir projects/redesign --no-encrypt --json
```

`public/` is only a routing convention. It does not disable encryption. Conversely,
`--public` is the legacy alias for `--no-encrypt`; it does **not** select the
`public/` directory or bypass VPN/Basic Auth. Using `--no-encrypt` under `public/`
would make the document readable without either kind of credential.

The infrastructure must gate every unmatched route and exempt only the intended
`/public/` subtree. Do not use a loose prefix match that also exempts `/publicity/`
or `/public-other/`. Keep bare `/public` gated unless you deliberately configure a
redirect to `/public/`. Verify normalized paths and rewrites cannot use the public
exception to reach objects outside `exhibits/public/`. This alternative replaces
the earlier public-by-default policy; it does not add an exception to that policy.

## Before deploying either route split

The supplied [AWS Terraform example](../examples/terraform/aws/README.md) creates a
private origin behind a public viewer endpoint. It does **not** implement either
VPN/Basic Auth split. An `internal/` path on that unmodified deployment is publicly
fetchable, just like every other path beneath its configured prefix.

For a mixed-access deployment, review the owning infrastructure configuration and:

1. Enforce the chosen policy: gate `/internal` and its descendants for the first
   design, or gate every route except the `/public/` subtree for the alternative.
   Test normalized and encoded path variants. Do not let another rewrite expose
   the same gated object through an unprotected URL.
2. Keep the origin private and prevent bypasses through direct storage access,
   alternate CDN hostnames, or unrelated viewer routes. Keep archives outside the
   viewer's allowed object prefixes.
3. Preserve the gate for cached responses as well as origin requests. Use Exhibit's
   required delivery/security headers and reviewed cache behavior on both routes.
4. After an approved deployment, test non-sensitive fixtures from outside VPN and
   from VPN. Confirm gated requests without VPN access or valid Basic Auth are
   denied, authorized requests work, and encrypted pages still require their
   artifact passwords. For the public-directory alternative, also test the root,
   a newly named directory, and public-looking sibling paths.

`doctor` checks the configured root; it does not accept `--dir` or prove VPN/Basic
Auth enforcement. `doctor --probe` writes and deletes a fixture and needs explicit
authorization. It is not a substitute for the route-access checks above.

If your routes use different origin roots, use separate matching configs instead
of assuming `--dir` can switch mappings. For example, an internal-only config can
pair prefix `exhibits/internal/` with URL base `https://share.example.com/internal`;
then use `--dir projects/redesign`, without repeating `internal/`. Separate buckets
or hostnames are also an option when access classes need stronger isolation.
Existing resources require an adaptation/import plan, not an unreviewed application
of the new-bucket Terraform example.
