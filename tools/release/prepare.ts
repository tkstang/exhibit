import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { marked } from 'marked';
import {
  hashes,
  preparationDecision,
  registry,
  registryVersion,
  requireTrustedNpm,
  validateMetadata,
} from './contracts.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function run(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  assert.equal(
    result.status,
    0,
    `${command} failed: ${result.stderr || result.stdout || result.error}`,
  );
  return result.stdout?.toString() ?? '';
}

export function releaseNotes(changelog: string, version: string): string {
  const tokens = marked.lexer(changelog);
  const matches = tokens.flatMap((token, index) =>
    token.type === 'heading' &&
    token.depth === 2 &&
    (token.text === `[${version}]` || token.text.startsWith(`[${version}] - `))
      ? [index]
      : [],
  );
  assert.equal(matches.length, 1, `Expected one changelog section for ${version}.`);
  const match = matches[0];
  assert.ok(match !== undefined);
  const start = match + 1;
  let end = tokens.findIndex(
    (token, index) => index >= start && token.type === 'heading' && token.depth <= 2,
  );
  if (end < 0) end = tokens.length;
  const section = tokens.slice(start, end);
  assert.ok(
    section.some((token) => !['space', 'heading', 'html'].includes(token.type)),
    'Release notes are empty.',
  );
  return (
    section
      .map((token) => token.raw)
      .join('')
      .trim() + '\n'
  );
}

export function validateGit(tag: string, execute = run) {
  const head = execute('git', ['rev-parse', 'HEAD']).trim();
  assert.equal(
    execute('git', ['rev-parse', `refs/tags/${tag}^{commit}`]).trim(),
    head,
    'Tag is not HEAD.',
  );
  execute('git', ['merge-base', '--is-ancestor', head, 'origin/main']);
  assert.equal(
    execute('git', ['status', '--porcelain']).trim(),
    '',
    'Release checkout must be clean.',
  );
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' }, tag: { type: 'string' } } });
  assert.ok(values.out, '--out must name a new output directory.');
  const pkg: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  validateMetadata(pkg, { tag: values.tag });
  if (values.tag) validateGit(values.tag);
  requireTrustedNpm(run('npm', ['--version']));
  const notes = releaseNotes(await readFile(join(root, 'CHANGELOG.md'), 'utf8'), pkg.version);
  const out = resolve(values.out);
  await mkdir(out); // Refuse reuse of a directory that could contain stale release files.
  run('pnpm', ['pack', '--pack-destination', out]);
  const archives = (await readdir(out)).filter((name) => name.endsWith('.tgz'));
  assert.deepEqual(archives, [`tkstang-exhibit-${pkg.version}.tgz`]);
  const archiveName = archives[0];
  assert.ok(archiveName);
  const archive = join(out, archiveName);
  run(process.execPath, ['tools/packaging/package.ts', '--archive', archive, '--install-smoke'], {
    stdio: 'inherit',
  });
  if (values.tag) validateGit(values.tag);
  const release = {
    commit: run('git', ['rev-parse', 'HEAD']).trim(),
    name: pkg.name,
    version: pkg.version,
    tag: `v${pkg.version}`,
    archive: archiveName,
    ...hashes(await readFile(archive)),
    notesSha256: hashes(Buffer.from(notes)).sha256,
  };
  const existing = await registryVersion(release);
  const decision = preparationDecision(
    existing.status,
    existing.document,
    release,
    Boolean(values.tag),
  );
  if (decision === 'publish') {
    run('npm', [
      'publish',
      archive,
      '--dry-run',
      '--ignore-scripts',
      '--access',
      'public',
      '--registry',
      registry,
    ]);
  } else {
    process.stdout.write(
      decision === 'already-published'
        ? 'Exact version already published; npm dry-run skipped for recovery.\n'
        : 'Version already exists; development archive validated, not cleared for publication.\n',
    );
  }
  await writeFile(join(out, 'release-notes.md'), notes, { flag: 'wx' });
  await writeFile(join(out, 'SHA256SUMS'), `${release.sha256}  ${release.archive}\n`, {
    flag: 'wx',
  });
  await writeFile(join(out, 'release.json'), JSON.stringify(release, null, 2) + '\n', {
    flag: 'wx',
  });
  process.stdout.write(`Release dry run passed: ${out}\nNo publication performed.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
