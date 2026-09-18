import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  registry,
  registryDecision,
  registryVersion,
  requireTrustedNpm,
  validatePublishContext,
  validateMetadata,
  validateRelease,
} from './contracts.ts';

assert.equal(process.argv.length, 3, 'Provide the validated release directory.');
const output = process.argv[2];
assert.ok(output);
const directory = resolve(output);
const pkg: unknown = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
validateMetadata(pkg);
const candidate: unknown = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
// Derive the path from the checked-out package, never from unvalidated artifact metadata.
const archive = join(directory, `tkstang-exhibit-${pkg.version}.tgz`);
validateRelease(
  candidate,
  pkg,
  await readFile(archive),
  await readFile(join(directory, 'release-notes.md')),
);
const release = candidate;
validatePublishContext(release, {
  ref: process.env.GITHUB_REF,
  sha: process.env.GITHUB_SHA,
  enabled: process.env.NPM_RELEASE_ENABLED,
});
assert.equal(
  await readFile(join(directory, 'SHA256SUMS'), 'utf8'),
  `${release.sha256}  ${release.archive}\n`,
);
const version = spawnSync('npm', ['--version'], { encoding: 'utf8' });
assert.equal(version.status, 0);
requireTrustedNpm(version.stdout);

async function lookup() {
  const existing = await registryVersion(release);
  return registryDecision(existing.status, existing.document, release);
}

if ((await lookup()) === 'publish') {
  const published = spawnSync(
    'npm',
    ['publish', archive, '--ignore-scripts', '--access', 'public', '--registry', registry],
    {
      stdio: 'inherit',
    },
  );
  assert.equal(published.status, 0, 'npm publish failed; inspect registry state before retrying.');
  assert.equal(
    await lookup(),
    'already-published',
    'Published version is not visible yet; retry after verifying registry state.',
  );
} else {
  process.stdout.write('Exact archive is already on npm; continuing release recovery.\n');
}
