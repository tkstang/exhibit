import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, realpath, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { expectedBundles, inventory, skillNames, validateBundle } from './skills.ts';

function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  assert.ok(
    typeof field === 'object' && field !== null && !Array.isArray(field),
    `Expected object: ${key}`,
  );
  return field as Record<string, unknown>;
}

const { values } = parseArgs({
  options: { archive: { type: 'string' }, 'install-smoke': { type: 'boolean' } },
});
const directory = await mkdtemp(join(tmpdir(), 'exhibit-package-'));
try {
  let archive = values.archive && resolve(values.archive);
  if (!archive) {
    const packed = spawnSync('pnpm', ['pack', '--pack-destination', directory], {
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const archives = (await readdir(directory)).filter((file) => file.endsWith('.tgz'));
    assert.equal(archives.length, 1);
    assert.ok(archives[0] !== undefined);
    archive = join(directory, archives[0]);
  }
  const listed = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const files = listed.stdout.trim().split('\n');
  for (const required of [
    'dist/cli.js',
    'assets/viewer.js',
    'assets/viewer.css',
    'assets/staticrypt-license.txt',
    'LICENSE',
    'CHANGELOG.md',
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
    'tools/git-hooks/install.mjs',
  ])
    assert.ok(files.includes(`package/${required}`), `Missing packaged resource: ${required}`);
  for (const page of await readdir(new URL('../../docs/', import.meta.url), { recursive: true })) {
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
  const sourcePackage = parseObject(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  const packedPackage = parseObject(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  for (const key of ['name', 'version', 'private', 'bin', 'repository', 'publishConfig'])
    assert.deepEqual(packedPackage[key], sourcePackage[key], `Packed metadata mismatch: ${key}`);
  for (const [path, bytes] of await expectedBundles()) {
    assert.ok(files.includes(`package/${path}`), `Missing packaged skill resource: ${path}`);
    assert.deepEqual(await readFile(join(packageRoot, path)), bytes, `Bundle drift: ${path}`);
  }
  for (const name of skillNames) {
    for (const distribution of ['skills', 'plugins/exhibit/skills']) {
      const isolated = await mkdtemp(join(directory, 'isolated-skill-'));
      await cp(join(packageRoot, distribution, name), isolated, { recursive: true });
      validateBundle(await inventory(isolated));
    }
  }
  let dependencies = fileURLToPath(new URL('../../node_modules', import.meta.url));
  if (values['install-smoke']) {
    const prefix = join(directory, 'npm-prefix');
    const installed = spawnSync(
      'npm',
      [
        'install',
        '--global',
        '--prefix',
        prefix,
        '--cache',
        join(directory, 'npm-cache'),
        '--no-audit',
        '--no-fund',
        archive,
      ],
      { cwd: directory, encoding: 'utf8', timeout: 120000 },
    );
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    for (const binary of ['exhibit', 'xbt']) {
      for (const command of ['version', 'help']) {
        const checked = spawnSync(join(prefix, 'bin', binary), [`--${command}`, '--json'], {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30000,
        });
        assert.equal(checked.status, 0, checked.stderr);
        const envelope = parseObject(checked.stdout);
        assert.equal(envelope.ok, true);
        assert.equal(envelope.command, command);
        if (command === 'version')
          assert.equal(objectField(envelope, 'data').version, sourcePackage.version);
      }
    }
    dependencies = join(prefix, 'lib/node_modules/@tkstang/exhibit/node_modules');
    process.stdout.write('Isolated npm install and both CLI aliases verified.\n');
  }
  await symlink(dependencies, join(packageRoot, 'node_modules'), 'junction');
  const version = spawnSync(process.execPath, ['dist/cli.js', '--version', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(version.status, 0, version.stderr);
  const resources = objectField(objectField(parseObject(version.stdout), 'data'), 'resources');
  assert.ok(typeof resources.docs === 'string');
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
