import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const packageName = '@tkstang/exhibit';
export const registry = 'https://registry.npmjs.org/';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface PackageMetadata {
  name: string;
  version: string;
  private: boolean;
  repository: { url: string };
  publishConfig: { access: string; registry: string };
  bin: { exhibit: string; xbt: string };
}

export interface ReleaseMetadata {
  name: string;
  version: string;
  tag: string;
  commit: string;
  archive: string;
  integrity: string;
  sha256: string;
  notesSha256: string;
}

function record(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
}

export function validateMetadata(
  pkg: unknown,
  { tag }: { tag?: string } = {},
): asserts pkg is PackageMetadata {
  record(pkg);
  assert.equal(typeof pkg.private, 'boolean');
  assert.ok(typeof pkg.version === 'string');
  record(pkg.repository);
  record(pkg.publishConfig);
  record(pkg.bin);
  assert.equal(pkg.name, packageName);
  assert.match(pkg.version, stableVersion, 'Only stable X.Y.Z releases are supported.');
  assert.equal(pkg.repository?.url, 'git+https://github.com/tkstang/exhibit.git');
  assert.equal(pkg.publishConfig?.registry, registry);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.bin?.exhibit, './dist/cli.js');
  assert.equal(pkg.bin?.xbt, pkg.bin.exhibit);
  if (tag !== undefined) {
    assert.equal(tag, `v${pkg.version}`, 'Tag must exactly match the package version.');
    assert.equal(
      pkg.private,
      false,
      'First publication is blocked until private is explicitly false.',
    );
  }
}

export function hashes(bytes: Uint8Array) {
  return {
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function validateRelease(
  release: unknown,
  pkg: unknown,
  bytes: Uint8Array,
  notes: Uint8Array,
): asserts release is ReleaseMetadata {
  record(release);
  validateMetadata(pkg);
  assert.ok(typeof release.tag === 'string', 'Release metadata must include the exact tag.');
  assert.ok(typeof release.commit === 'string');
  assert.match(release.commit, /^[a-f0-9]{40}$/, 'Missing release commit.');
  assert.equal(release.tag, `v${pkg.version}`, 'Release metadata must include the exact tag.');
  validateMetadata(pkg, { tag: release.tag });
  assert.equal(release.name, pkg.name);
  assert.equal(release.version, pkg.version);
  assert.equal(release.archive, `tkstang-exhibit-${pkg.version}.tgz`);
  assert.equal(release.integrity, hashes(bytes).integrity, 'Archive integrity mismatch.');
  assert.equal(release.sha256, hashes(bytes).sha256, 'Archive checksum mismatch.');
  assert.equal(
    release.notesSha256,
    hashes(notes).sha256,
    'Release notes changed after validation.',
  );
}

type RegistryIdentity = Pick<ReleaseMetadata, 'name' | 'version' | 'integrity'>;

export function registryDecision(status: number, document: unknown, release: RegistryIdentity) {
  if (status === 404) return 'publish';
  assert.equal(status, 200, `Registry lookup failed (${status}); refusing publication.`);
  record(document);
  record(document.dist);
  assert.equal(document.name, release.name);
  assert.equal(document.version, release.version);
  assert.equal(
    document.dist?.integrity,
    release.integrity,
    'Existing version has different bytes.',
  );
  return 'already-published';
}

export function preparationDecision(
  status: number,
  document: unknown,
  release: RegistryIdentity,
  tagged: boolean,
) {
  if (status === 200 && !tagged) {
    record(document);
    assert.equal(document.name, release.name);
    assert.equal(document.version, release.version);
    return 'development-only';
  }
  return registryDecision(status, document, release);
}

export async function registryVersion(release: Pick<ReleaseMetadata, 'name' | 'version'>) {
  const response = await fetch(
    `${registry}${encodeURIComponent(release.name)}/${release.version}`,
    {
      signal: AbortSignal.timeout(30000),
    },
  );
  return {
    status: response.status,
    document: response.status === 200 ? ((await response.json()) as unknown) : null,
  };
}

export function validatePublishContext(
  release: { commit: unknown; tag: string },
  {
    ref,
    sha,
    enabled,
  }: { ref: string | undefined; sha: string | undefined; enabled: string | undefined },
) {
  assert.equal(enabled, 'true', 'NPM_RELEASE_ENABLED must be exactly true.');
  assert.ok(typeof release.commit === 'string', 'Missing release commit.');
  assert.match(release.commit, /^[a-f0-9]{40}$/, 'Missing release commit.');
  assert.equal(ref, `refs/tags/${release.tag}`, 'Publishing requires the matching tag ref.');
  assert.equal(release.commit, sha, 'Release archive belongs to a different commit.');
}

export function requireTrustedNpm(version: string) {
  const [major, minor, patch] = version.trim().split('.').map(Number);
  assert.ok(major !== undefined && minor !== undefined && patch !== undefined);
  assert.ok(
    Number.isInteger(major) &&
      Number.isInteger(minor) &&
      Number.isInteger(patch) &&
      (major > 11 || (major === 11 && (minor > 5 || (minor === 5 && patch >= 1)))),
    'npm >=11.5.1 is required for trusted publishing.',
  );
}
