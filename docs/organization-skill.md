# Organization wrapper skill

An organization can distribute a small skill that selects its Exhibit deployment
and sharing conventions. Exhibit still owns rendering, encryption, storage, and
error handling. The wrapper supplies the destination and organization policy; it
does not need another CLI or service.

## Example bundle

The [share-exhibit example](../examples/skills/share-exhibit/SKILL.md) contains:

```text
share-exhibit/
  SKILL.md
  references/
    exhibit-config.json
```

Keep `SKILL.md` at the skill root and the non-secret deployment JSON in
`references/`. Exhibit does not require that location; it is a bundle convention.
The skill resolves the config relative to its installed directory and passes an
absolute `--config` path, so it works from any project checkout. Moving the JSON
to the skill root also works if its instructions change to match.

The wrapper locates the installed canonical publishing procedure through
`exhibit --version --json` and `data.resources.skills`. It reads that procedure as
instructions rather than depending on a host-specific skill invocation command.
This avoids maintaining a second copy of Exhibit's general publishing workflow.

## Adapt and distribute

Before distributing the bundle in your organization's skills repo:

1. Replace the bucket, region, prefix, and URL placeholders in
   [the config](../examples/skills/share-exhibit/references/exhibit-config.json)
   with the reviewed deployment values. Set its `brand` fields as described below.
2. Confirm the route policy in `SKILL.md`. The example uses the
   [public-directory-only proposal](bucket-layout.md#public-directory-only):
   everything requires VPN or Basic Auth except `/public/` descendants.
   This is an example assumption, not a deployed gate.
   The [split-DNS example](cloudfront.md#split-dns-delivery-example) shows how one
   hostname can serve the same keys through public and VPN delivery paths.
3. Document the approved AWS profile/SSO setup in the organization-owned skill.
   Profile names can be non-secret instructions; credentials, passwords, and
   session tokens must not go in the bundle. The config has no credential fields.
4. Decide who may authorize external sharing and whether skipping encryption is
   permitted. Adapt the namespace rules if your organization uses different names.
5. Distribute the whole directory through your existing skill tooling. For a host
   that discovers `.agents/skills/`, the destination is
   `.agents/skills/share-exhibit/`. Follow other hosts' discovery conventions.

Install the Exhibit CLI separately through an approved process. This repository's
package is still private; the example does not assume an npm release exists.
Publishing permission applies to the selected file, not its directory or repository.
Never store password receipts inside the shared skill bundle.

## Example behavior

With prefix `exhibits/` and URL base `https://share.example.com`:

| Request                            | Directory                  | Resulting URL with slug `review`                                 |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| Share a repo plan internally       | `repositories/demo`        | `https://share.example.com/repositories/demo/review.html`        |
| Share it externally                | `public/repositories/demo` | `https://share.example.com/public/repositories/demo/review.html` |
| Share a standalone file internally | `standalone`               | `https://share.example.com/standalone/review.html`               |

The skill asks when the audience or destination is unclear. All three examples
encrypt by default. External sharing does not imply permission for plaintext.
The CLI command is the same in each case; only `--dir` changes:

```bash
exhibit --config /installed/share-exhibit/references/exhibit-config.json \
  publish /selected/plan.md --dir public/repositories/demo --json
```

These are illustrative paths. The agent must resolve the real installed skill and
selected file rather than guessing them. Infrastructure enforces the access gate;
skill instructions alone cannot prevent unauthorized reads or writes.

## Organization branding

Branding belongs in the same bundled JSON, not in Terraform or a separate skill flag:

```json
"brand": {
  "name": "Example Organization",
  "accent": "#1459a6"
}
```

Both Markdown and standalone HTML become hosted HTML pages. The configured brand
appears in the shared viewer, and Markdown also gets a branded generated document.
Exhibit preserves a standalone HTML document's own design inside that viewer.
See [branding behavior and limitations](configuration.md#branding) for the exact
scope, including dark mode and information visible before decryption.
