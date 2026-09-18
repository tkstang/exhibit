import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'exhibit-package-'));
try {
  const packed = spawnSync('pnpm', ['pack', '--pack-destination', directory], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const archives = (await readdir(directory)).filter((file) => file.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = join(directory, archives[0]);
  const listed = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const files = listed.stdout.trim().split('\n');
  for (const required of [
    'dist/cli.js',
    'assets/viewer.js',
    'assets/viewer.css',
    'assets/staticrypt-license.txt',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'VERIFICATION.md',
    'LOCAL-HANDOFF.md',
    'docs/security-model.md',
    'skills/exhibit-publish/SKILL.md',
    'skills/exhibit-setup/SKILL.md',
    'examples/terraform/aws/main.tf',
    'tools/install-hooks.mjs',
  ])
    assert.ok(files.includes(`package/${required}`), `Missing packaged resource: ${required}`);
  for (const file of files) {
    assert.doesNotMatch(
      file,
      /(?:^|\/)(?:\.terraform|\.git|\.oat|node_modules|\.env|\.exhibit)(?:\/|$)|\.tfstate|\.tfplan|\/terraform\.tfvars$|\.test\./,
    );
  }
  assert.ok((await stat(archive)).size < 2 * 1024 * 1024, 'Package unexpectedly exceeds 2 MiB.');
  const extracted = spawnSync('tar', ['-xzf', archive, '-C', directory], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const packageRoot = join(directory, 'package');
  await symlink(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
    join(packageRoot, 'node_modules'),
    'junction',
  );
  const smoke = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { createProtector } from './dist/security/staticrypt.js';
    import { protectHtml } from './dist/render/viewer.js';
    import { parseConfig } from './dist/core/config.js';
    const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
    assert.equal(pkg.bin.exhibit, pkg.bin.xbt);
    const config = parseConfig({storage: {bucket: 'fixture-bucket', region: 'us-east-1'}, publicBaseUrl: 'https://example.test'});
    const html = await protectHtml('<p>packed private fixture</p>', 'packed-fixture-password', config, createProtector());
    assert.ok(html.includes('exhibit-payload'));
    assert.ok(!html.includes('packed private fixture'));
    assert.ok(!html.includes('packed-fixture-password'));
  `,
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  );
  assert.equal(smoke.status, 0, smoke.stderr);
  process.stdout.write(
    `Package verified: ${files.length} files, required resources present, no state or provider caches.\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
