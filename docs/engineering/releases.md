---
title: npm releases
description: Prepare one reviewed archive, bootstrap trusted publishing, and release stable versions.
---

# npm releases

Exhibit releases one package, `@tkstang/exhibit`, using Node 24 and pnpm 11.8.0.
The release workflows and local checks are defined in this repository. That does
not establish that npm trust is configured or publication has passed. The first-release
preparation sets `private: false`; this permits publication but does not authorize
or perform it. Source merge, npm publication, and hosting qualification
are separate decisions. No multi-package release tooling or Changesets is needed.

The GitHub repository is public. Repository visibility and npm package visibility
are separate settings; neither establishes that a package has been published.
Trusted publishing from GitHub-hosted Actions runners can generate npm provenance
for a public package from this public repository. The local bootstrap publication
below does not generate CI provenance. Verify the published version's attestation
after a trusted-publishing release before claiming provenance. See the
[official npm trusted publishing guide](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation).

## Prepare and inspect an archive

Use the [development toolchain](development.md#toolchain), with dependencies and
Chromium already installed. From the repository root, choose an absolute output
path that does not exist:

```bash
pnpm release:validate --out /absolute/unused/path
```

Validation runs the full checks, HTTP browser tests, packing, an installed-package
smoke test, and a registry lookup. For a new version it also runs a dry-run npm
publish. For an existing version, tagged validation requires identical registry
integrity and skips npm's dry-run, which rejects already-published versions.
Untagged PR validation allows development changes without a version bump and
reports that the archive is not cleared for publication. Registry errors fail
both paths. None of these checks publish to npm. The output contains:

- The reviewed `.tgz` archive.
- `SHA256SUMS` for checking the archive.
- `release.json` with release metadata.
- `release-notes.md`, extracted from `CHANGELOG.md`.

`CHANGELOG.md` is canonical. The first-release PR confirms the initial `0.1.0`
version; later release PRs increment it. Each includes a reviewed
`## [<packageversion>]` section, for example `## [0.1.0]`. Release
validation fails if the matching section is missing or empty. Skills may draft
the entry under the repository's release-authoring guidance; review it in the PR.
CI extracts that section automatically and supplies it to GitHub Release through
`--notes-file`, without generating replacement notes.

Inspect the archive for expected runtime files, assets, docs, skills, examples,
and licenses, and for the absence of secrets, receipts, and caches. Review the
notes alongside it. In the output directory, check `shasum -a 256 -c SHA256SUMS`.
Retain the output through publication and any retry.

For publication readiness, add the exact stable tag:

```bash
pnpm release:validate --out /absolute/unused/release-path --tag v0.1.0
```

Use the actual approved version. This adds the `private: false` requirement and
Git/tag guards: the tag must be exactly `v<package.json version>`, resolve to
`HEAD`, and that commit must be reachable from `origin/main`. Only stable
`vX.Y.Z` versions are supported initially; prereleases are not supported.

## First-release setup checklist

Perform these steps in order. First publication and remote configuration are
maintainer actions requiring explicit approval; these instructions do not perform
or authorize them.

1. Keep the repository Actions variable `NPM_RELEASE_ENABLED` unset or `false`.
   The publishing job requires its exact value to be `true`. Keep `private: true`
   while reviewing and landing the release tooling.
2. Verify `.github/workflows/release.yml` is on `main`, uses GitHub-hosted runners
   and `id-token: write`, and uses Node 24, pnpm 11.8.0, and npm 11.5.1 or newer.
   Configure the GitHub environment named `npm` manually before automation.
   Add required reviewer approval if the account plan and repository visibility
   support it. If the required environment is unavailable, leave publishing
   disabled and resolve that limitation before proceeding.
3. Verify package metadata identifies `tkstang/exhibit`: `repository.type` is
   `git`, `repository.url` is `git+https://github.com/tkstang/exhibit.git`, and
   `publishConfig` sets `access: "public"` and
   `registry: "https://registry.npmjs.org/"`. This metadata does not itself publish.
4. Obtain first-release approval. In the reviewed release PR, set `private: false`,
   confirm the chosen stable version, and add its changelog section. Merge only
   after review and green CI. Keep automation disabled throughout bootstrap.
5. At that clean, merged commit, create the matching local tag and run tagged
   validation into an unused absolute directory. Review and retain all outputs.
   Do not push the tag or dispatch the workflow yet.
6. A maintainer signs in locally with `npm login`, completes npm's 2FA flow, and
   publishes the approved archive, substituting its actual path:

   ```bash
   npm publish /absolute/unused/release-path/tkstang-exhibit-0.1.0.tgz --access public
   ```

   Publish the validated tarball, not the working directory. Do not add an npm
   token to GitHub or put registry credentials in documentation.

7. Once the package exists, open its npm settings and add a GitHub Actions trusted
   publisher with the exact values below. Explicitly allow direct `npm publish`;
   stage-only permission does not satisfy this workflow.

   | npm field            | Value                      |
   | -------------------- | -------------------------- |
   | Organization or user | `tkstang`                  |
   | Repository           | `exhibit`                  |
   | Workflow filename    | `release.yml`              |
   | Environment name     | `npm`                      |
   | Allowed actions      | Allow direct `npm publish` |

8. Check the saved trust fields and GitHub environment, then explicitly set the
   repository Actions variable `NPM_RELEASE_ENABLED` to `true`. Saving trust
   settings alone does not prove OIDC publication works. Only now, with push and
   release authorization, push the existing bootstrap tag. Retain the original
   archive: the existing-version path must match npm's registry integrity before
   completing the GitHub Release.
9. Confirm the published package/version and GitHub Release assets. Only after
   actual publication, update the [installation guide](../user-guide/installation.md)
   and its generated skill references through the normal source/build workflow.
   Until then, keep archive-based installation instructions and avoid claiming a
   live registry release.

The runner, npm version, OIDC permission, exact trust fields, and direct-publish
permission follow [npm's setup instructions](https://docs.npmjs.com/trusted-publishers/).
No long-lived npm token is needed in GitHub.

## Release the next stable version

1. Open a release PR updating `package.json` to the next stable version and adding
   its reviewed `CHANGELOG.md` section. Keep package and lockfile metadata aligned
   where applicable. Run local validation, review the resulting archive and notes,
   and require green PR CI before merge.
2. After merge, fetch `origin/main` and tags, then check out the approved merged
   commit with a clean tree. Confirm the environment and enabled variable remain
   correctly configured. Create the version tag and run tagged validation:

   ```bash
   git tag -a v0.1.1 -m "Release v0.1.1"
   pnpm release:validate --out /absolute/unused/v0.1.1-release --tag v0.1.1
   ```

   Replace `0.1.1` with the approved package version. Tag the reviewed commit;
   do not move an existing release tag.

3. With explicit push/publication authorization, run `git push origin v0.1.1`.
   The `v*` tag trigger starts `release.yml`; validation rejects anything other
   than the exact stable version/tag/commit contract. Complete any configured
   environment approval.
4. The workflow validates and publishes the same prepared archive using
   `node tools/release/publish.ts <outputdirectory>`. Only after npm succeeds or
   the existing version's integrity is verified does it create the GitHub Release,
   use the extracted notes, and attach the `.tgz` and `SHA256SUMS`. `release.json`
   and `release-notes.md` remain preparation outputs, not release attachments.

## Retry or investigate a failure

For a manual rerun, select the existing release tag as the workflow ref. There is
no arbitrary tag input. For example, with rerun authorization:

```bash
gh workflow run release.yml --ref v0.1.1
```

Prefer GitHub's **Re-run failed jobs** when validation succeeded and only publishing
or GitHub Release creation failed. That reuses the retained validation artifact.
A new workflow dispatch rebuilds the tag and is accepted only if its archive
matches the already-published bytes. Do not assume local and CI rebuilds are identical.

Preserve the same archive across retries. If npm already has the version, the
publisher verifies registry integrity against that archive and proceeds only on
a match. It must not replace the archive with a different rebuild, overwrite a
published version, or attach mismatched bytes to GitHub Release.

Authentication failures, network failures, and conflicting version integrity
stop the release. Resolve the reported cause and retain the prepared outputs;
do not interpret an uncertain registry response as an absent version. If npm
succeeded but the GitHub Release failed, recover using the matching archive and
existing tag. If a bootstrap archive differs from the CI rebuild, leave the failure
in place; a maintainer must compare the original retained archive with npm and
complete the GitHub Release from those verified bytes. Do not change the registry
integrity check or move the tag to force a retry through.
Check actual workflow, registry, and asset state before claiming
success. `npm whoami` is not an OIDC readiness test because OIDC authentication
occurs during publication, as noted in
[npm's limitations](https://docs.npmjs.com/trusted-publishers/#limitations-and-future-improvements).
