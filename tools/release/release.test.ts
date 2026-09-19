import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { normalizeReleaseArchive } from './archive.ts';
import {
  hashes,
  preparationDecision,
  registryDecision,
  requireTrustedNpm,
  validateMetadata,
  validatePublishContext,
  validateRelease,
} from './contracts.ts';
import { releaseNotes, validateGit } from './prepare.ts';

const candidate: unknown = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
validateMetadata(candidate);
const source = candidate;
const publishable = { ...source, private: false };

test('archive normalization makes macOS and Unix gzip bytes and hashes identical', () => {
  const mac = gzipSync(Buffer.from('release archive contents'));
  mac[9] = 19;
  const unix = Buffer.from(mac);
  unix[9] = 3;
  const macBefore = Buffer.from(mac);
  const unixBefore = Buffer.from(unix);
  assert.notDeepEqual(hashes(mac), hashes(unix));

  const normalizedMac = normalizeReleaseArchive(mac);
  const normalizedUnix = normalizeReleaseArchive(unix);
  assert.equal(normalizedMac[9], 255);
  assert.equal(normalizedUnix[9], 255);
  assert.deepEqual(normalizedMac, normalizedUnix);
  assert.deepEqual(hashes(normalizedMac), hashes(normalizedUnix));
  assert.deepEqual(mac, macBefore);
  assert.deepEqual(unix, unixBefore);
  assert.deepEqual(normalizeReleaseArchive(normalizedMac), normalizedMac);
});

test('archive normalization changes only the OS byte and preserves decompressed contents', () => {
  const contents = Buffer.from('release archive contents\nwith another line\n');
  const bytes = gzipSync(contents, { level: 9 });
  bytes.writeUInt32LE(123456789, 4);
  bytes[9] = 19;
  const before = Buffer.from(bytes);

  const normalized = normalizeReleaseArchive(bytes);
  assert.equal(normalized.length, before.length);
  assert.equal(normalized[9], 255);
  assert.deepEqual(normalized.subarray(0, 9), before.subarray(0, 9));
  assert.deepEqual(normalized.subarray(10), before.subarray(10));
  assert.deepEqual(gunzipSync(normalized), contents);
  assert.deepEqual(gunzipSync(normalized), gunzipSync(before));
  assert.deepEqual(bytes, before);
});

test('archive normalization rejects short headers, non-gzip bytes, and other compression methods', () => {
  const valid = gzipSync(Buffer.from('release archive contents'));
  for (let length = 0; length < 10; length++)
    assert.throws(() => normalizeReleaseArchive(valid.subarray(0, length)));
  assert.throws(() => normalizeReleaseArchive(Buffer.alloc(valid.length)));
  for (const offset of [0, 1, 2]) {
    const invalid = Buffer.from(valid);
    invalid[offset] = 0;
    assert.throws(() => normalizeReleaseArchive(invalid));
  }
});

test('archive normalization rejects optional gzip fields and header CRC flags', () => {
  const valid = gzipSync(Buffer.from('release archive contents'));
  for (const [flag, extra] of [
    [0x04, Buffer.from([0, 0])],
    [0x08, Buffer.from('archive.tar\0')],
    [0x10, Buffer.from('comment\0')],
  ] as const) {
    const flagged = Buffer.concat([valid.subarray(0, 10), extra, valid.subarray(10)]);
    flagged[3] = flag;
    assert.deepEqual(gunzipSync(flagged), gunzipSync(valid));
    assert.throws(() => normalizeReleaseArchive(flagged));
  }
  const headerCrc = Buffer.from(valid);
  headerCrc[3] = 0x02;
  assert.throws(() => normalizeReleaseArchive(headerCrc));
});

test('archive normalization rejects corrupt and truncated gzip streams', () => {
  const valid = gzipSync(Buffer.from('release archive contents'));
  const corrupt = Buffer.from(valid);
  corrupt.writeUInt32LE((corrupt.readUInt32LE(corrupt.length - 8) ^ 1) >>> 0, corrupt.length - 8);
  for (const invalid of [
    corrupt,
    valid.subarray(0, 10),
    valid.subarray(0, valid.length - 8),
    valid.subarray(0, valid.length - 1),
  ]) {
    assert.throws(() => gunzipSync(invalid));
    assert.throws(() => normalizeReleaseArchive(invalid));
  }
});

test('normalized archives retain content differences and registry recovery rejects them', () => {
  const original = normalizeReleaseArchive(gzipSync(Buffer.from('original archive contents')));
  const changed = normalizeReleaseArchive(gzipSync(Buffer.from('changed archive contents')));
  const originalHashes = hashes(original);
  const changedHashes = hashes(changed);
  assert.notEqual(originalHashes.sha256, changedHashes.sha256);
  assert.notEqual(originalHashes.integrity, changedHashes.integrity);
  const release = { name: source.name, version: source.version, ...originalHashes };
  const record = {
    name: source.name,
    version: source.version,
    dist: { integrity: originalHashes.integrity },
  };
  assert.equal(registryDecision(200, record, release), 'already-published');
  assert.throws(
    () => registryDecision(200, record, { ...release, ...changedHashes }),
    /different bytes/,
  );
});

test('dry run accepts private packages but publication requires explicit opt-in', () => {
  validateMetadata({ ...source, private: true });
  assert.throws(
    () => validateMetadata({ ...source, private: true }, { tag: `v${source.version}` }),
    /private/,
  );
  validateMetadata(publishable, { tag: `v${source.version}` });
});

test('release metadata rejects wrong tags, prereleases, package identities, and registries', () => {
  for (const tag of [
    'main',
    'v99.0.0',
    `v${source.version}-rc.1`,
    `${source.version}\n`,
    'v01.0.0',
  ])
    assert.throws(() => validateMetadata(publishable, { tag }));
  for (const change of [
    { version: '1.0.0-rc.1' },
    { name: 'other' },
    { repository: {} },
    { publishConfig: { access: 'public', registry: 'https://other.test/' } },
    { bin: { exhibit: './dist/cli.js', xbt: './different.js' } },
  ])
    assert.throws(() => validateMetadata({ ...publishable, ...change }));
});

test('notes come only from the matching changelog section, preserving Markdown', () => {
  const input =
    '# Changelog\n\n## [Unreleased]\n\n- Future\n\n## [1.2.3] - 2026-09-18\n\n### Fixed\n\n- Actual fix\n\n```text\n## [9.9.9]\n```\n\n## [1.2.2]\n\n- Old\n';
  assert.equal(
    releaseNotes(input, '1.2.3'),
    '### Fixed\n\n- Actual fix\n\n```text\n## [9.9.9]\n```\n',
  );
});

test('missing, duplicate, and empty changelog entries block release preparation', () => {
  for (const changelog of [
    '## [Unreleased]\n\n- Future\n',
    '## [1.2.3]\n\n## [1.2.2]\n\n- Old\n',
    '## [1.2.3]\n\n### Fixed\n\n<!-- TODO -->\n',
    '## [1.2.3]\n\n- One\n\n## [1.2.3]\n\n- Two\n',
  ])
    assert.throws(() => releaseNotes(changelog, '1.2.3'));
});

test('the repository changelog contains notes for its current version', async () => {
  assert.ok(
    releaseNotes(
      await readFile(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'),
      source.version,
    ),
  );
});

function fixtureRelease() {
  const bytes = Buffer.from('original archive');
  const notes = Buffer.from('reviewed notes');
  return {
    bytes,
    notes,
    release: {
      commit: 'a'.repeat(40),
      name: source.name,
      version: source.version,
      tag: `v${source.version}`,
      archive: `tkstang-exhibit-${source.version}.tgz`,
      ...hashes(bytes),
      notesSha256: hashes(notes).sha256,
    },
  };
}

test('publishing verifies archive bytes, note bytes, identity, and filenames', () => {
  const { bytes, notes, release } = fixtureRelease();
  validateRelease(release, publishable, bytes, notes);
  assert.throws(
    () => validateRelease({ ...release, tag: undefined }, source, bytes, notes),
    /exact tag/,
  );
  assert.throws(
    () => validateRelease(release, publishable, Buffer.from('changed'), notes),
    /integrity/,
  );
  assert.throws(
    () => validateRelease(release, publishable, bytes, Buffer.from('changed')),
    /notes/,
  );
  assert.throws(() =>
    validateRelease({ ...release, archive: '../other.tgz' }, publishable, bytes, notes),
  );
  assert.throws(() =>
    validateRelease({ ...release, version: '99.0.0' }, publishable, bytes, notes),
  );
});

test('only a registry 404 allows a new publish; exact existing bytes allow recovery', () => {
  const { release } = fixtureRelease();
  assert.equal(registryDecision(404, null, release), 'publish');
  const record = {
    name: release.name,
    version: release.version,
    dist: { integrity: release.integrity },
  };
  assert.equal(registryDecision(200, record, release), 'already-published');
  assert.throws(
    () => registryDecision(200, { ...record, dist: { integrity: 'other' } }, release),
    /different bytes/,
  );
  for (const status of [401, 403, 429, 500, 503])
    assert.throws(() => registryDecision(status, null, release), /lookup failed/);
  assert.throws(() => registryDecision(200, {}, release));
});

test('trusted publishing requires a sufficiently new npm runtime', () => {
  for (const version of ['11.5.1', '11.16.0', '12.0.0']) requireTrustedNpm(version);
  for (const version of ['10.9.0', '11.5.0', 'unknown', '11.6'])
    assert.throws(() => requireTrustedNpm(version));
});

test('preparation permits unchanged-version PR work but requires identical bytes for tagged recovery', () => {
  const { release } = fixtureRelease();
  const existing = {
    name: release.name,
    version: release.version,
    dist: { integrity: 'different' },
  };
  assert.equal(preparationDecision(200, existing, release, false), 'development-only');
  assert.throws(() => preparationDecision(200, existing, release, true), /different bytes/);
  existing.dist.integrity = release.integrity;
  assert.equal(preparationDecision(200, existing, release, true), 'already-published');
  assert.equal(preparationDecision(404, null, release, true), 'publish');
  assert.throws(() => preparationDecision(503, null, release, false), /lookup failed/);
});

test('publication requires exact enablement, tag ref, and matching commit', () => {
  const release = { ...fixtureRelease().release, commit: 'a'.repeat(40) };
  const context = { ref: `refs/tags/${release.tag}`, sha: release.commit, enabled: 'true' };
  validatePublishContext(release, context);
  for (const enabled of [undefined, '', 'false', 'True', 'TRUE'])
    assert.throws(() => validatePublishContext(release, { ...context, enabled }), /exactly true/);
  assert.throws(
    () => validatePublishContext(release, { ...context, ref: 'refs/heads/main' }),
    /tag ref/,
  );
  assert.throws(
    () => validatePublishContext(release, { ...context, sha: 'b'.repeat(40) }),
    /different commit/,
  );
  assert.throws(() =>
    validatePublishContext({ ...release, commit: undefined }, { ...context, sha: undefined }),
  );
});

test('real Git guards reject non-main commits, wrong tags, missing refs, and dirty worktrees', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'exhibit-release-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  function git(...args: string[]) {
    const result = spawnSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'user.name=Release Test',
        '-c',
        'user.email=release@example.test',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  const execute = (command: string, args: string[]) => {
    assert.equal(command, 'git');
    return git(...args);
  };
  git('init', '-b', 'main');
  git('commit', '--allow-empty', '-m', 'fixture');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('tag', 'v1.0.0');
  validateGit('v1.0.0', execute);
  await writeFile(join(root, 'dirty.txt'), 'dirty');
  assert.throws(() => validateGit('v1.0.0', execute), /clean/);
  await rm(join(root, 'dirty.txt'));
  git('commit', '--allow-empty', '-m', 'not merged');
  git('tag', 'v1.0.1');
  assert.throws(() => validateGit('v1.0.0', execute), /not HEAD/);
  assert.throws(() => validateGit('v1.0.1', execute));
  git('update-ref', '-d', 'refs/remotes/origin/main');
  assert.throws(() => validateGit('v1.0.1', execute));
});
