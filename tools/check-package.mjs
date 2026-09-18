import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, realpath, rm, stat, symlink } from 'node:fs/promises';
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
    'docs/index.md',
    'docs/engineering/verification.md',
    'docs/user-guide/index.md',
    'docs/user-guide/agents/index.md',
    'docs/user-guide/deployment/index.md',
    'docs/engineering/index.md',
    'docs/user-guide/security-model.md',
    'docs/user-guide/agents/organization-skill.md',
    'skills/exhibit-publish/SKILL.md',
    'skills/exhibit-setup/SKILL.md',
    'examples/skills/share-exhibit/SKILL.md',
    'examples/skills/share-exhibit/references/exhibit-config.json',
    'examples/terraform/aws/main.tf',
    'tools/install-hooks.mjs',
  ])
    assert.ok(files.includes(`package/${required}`), `Missing packaged resource: ${required}`);
  for (const page of await readdir(new URL('../docs/', import.meta.url), { recursive: true })) {
    if (page.endsWith('.md'))
      assert.ok(
        files.includes(`package/docs/${page.replaceAll('\\', '/')}`),
        `Missing packaged doc: ${page}`,
      );
  }
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
  const version = spawnSync(process.execPath, ['dist/cli.js', '--version', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(version.status, 0, version.stderr);
  const resources = JSON.parse(version.stdout).data.resources;
  assert.equal(
    await realpath(join(resources.docs, 'index.md')),
    await realpath(join(packageRoot, 'docs/index.md')),
  );
  for (const page of ['user-guide/cli.md', 'engineering/verification.md'])
    assert.ok((await stat(join(resources.docs, page))).isFile());
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
    const organizationConfig = parseConfig(JSON.parse(await readFile('./examples/skills/share-exhibit/references/exhibit-config.json', 'utf8')));
    assert.equal(organizationConfig.storage.prefix, 'exhibits/');
    assert.equal(organizationConfig.brand.name, 'Example Organization');
    const skill = await readFile('./examples/skills/share-exhibit/SKILL.md', 'utf8');
    assert.ok(skill.startsWith('---\\nname: share-exhibit\\n'));
    assert.ok(skill.includes('references/exhibit-config.json'));
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
