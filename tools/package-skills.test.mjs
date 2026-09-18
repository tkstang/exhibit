import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CONTENT_SECURITY_POLICY } from '../src/security/policy.ts';
import {
  expectedBundles,
  inventory,
  packageSkills,
  skillNames,
  validateBundle,
} from './package-skills.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'exhibit-skill-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['src/skills', 'src/plugin', 'docs/user-guide/installation.md', 'LICENSE']) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await cp(join(repository, path), join(root, path), { recursive: true });
  }
  return root;
}

test('standalone and plugin bundles are identical and work after isolated relocation', async (t) => {
  const root = await fixture(t);
  await packageSkills({ root });
  await packageSkills({ root, check: true });
  for (const name of skillNames) {
    const standalone = await inventory(join(root, 'skills', name));
    const plugin = await inventory(join(root, 'plugins/exhibit/skills', name));
    assert.deepEqual(plugin, standalone);
    const destination = join(root, 'unrelated-project', name);
    await cp(join(root, 'skills', name), destination, { recursive: true });
    const isolated = await inventory(destination);
    validateBundle(isolated);
    const skill = isolated.get('SKILL.md').toString();
    assert.match(skill, /\]\(references\/installation\.md\)/);
    assert.doesNotMatch(skill, /data\.resources\.docs|docs\/engineering|\.\.\/.*\.md/);
    for (const command of ['exhibit --version --json', 'xbt --version --json', '--help --json'])
      assert.ok(skill.includes(command));
    assert.match(skill, /schema_version: 1/);
    assert.match(skill, /ok: true/);
    assert.match(skill, /command: "version"/);
    assert.ok(isolated.has('LICENSE'));
    for (const [path, bytes] of isolated)
      if (path.endsWith('.md')) assert.doesNotMatch(bytes.toString(), /`doctor(?:\s[^`]*)?`/);
  }
});

test('check mode detects drift without repairing it; build removes obsolete generated files', async (t) => {
  const root = await fixture(t);
  await packageSkills({ root });
  const path = join(root, 'skills/exhibit-publish/SKILL.md');
  await writeFile(path, 'stale');
  await writeFile(join(root, 'plugins/exhibit/obsolete.txt'), 'stale');
  await assert.rejects(packageSkills({ root, check: true }), /stale/);
  assert.equal(await readFile(path, 'utf8'), 'stale');
  await packageSkills({ root });
  await packageSkills({ root, check: true });
  assert.ok(!(await inventory(join(root, 'plugins/exhibit'))).has('obsolete.txt'));
});

test('a missing source reference fails before any generated output changes', async (t) => {
  const root = await fixture(t);
  await packageSkills({ root });
  const before = await inventory(join(root, 'skills'));
  await rm(join(root, 'src/skills/exhibit-publish/references/publication.md'));
  await assert.rejects(packageSkills({ root }), /missing or escaping/);
  assert.deepEqual(await inventory(join(root, 'skills')), before);
});

test('empty supporting files are emitted and missing copies fail the drift check', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'src/skills/exhibit-publish/references/empty.txt'), '');
  await packageSkills({ root });
  const generated = join(root, 'plugins/exhibit/skills/exhibit-publish/references/empty.txt');
  assert.equal(await readFile(generated, 'utf8'), '');
  await rm(generated);
  await assert.rejects(packageSkills({ root, check: true }), /stale/);
  await packageSkills({ root });
  await packageSkills({ root, check: true });
});

test('shared installation edits require refreshing both distribution forms', async (t) => {
  const root = await fixture(t);
  await packageSkills({ root });
  const path = join(root, 'docs/user-guide/installation.md');
  await writeFile(path, `${await readFile(path, 'utf8')}\nUpdated fixture guidance.\n`);
  await assert.rejects(packageSkills({ root, check: true }), /stale/);
  await packageSkills({ root });
  for (const name of skillNames) {
    for (const prefix of ['skills', 'plugins/exhibit/skills']) {
      assert.equal(
        await readFile(join(root, prefix, name, 'references/installation.md'), 'utf8'),
        await readFile(path, 'utf8'),
      );
    }
  }
});

test('bundles reject missing, escaping, filesystem-URL, and raw HTML references', () => {
  for (const link of ['missing.md', '../outside.md', '%2e%2e/outside.md', '/etc/passwd'])
    assert.throws(
      () => validateBundle(new Map([['SKILL.md', Buffer.from(`[bad](${link})`)]])),
      /missing or escaping/,
    );
  for (const text of [
    '[file](file:///outside/secret.md)',
    '<file:///outside/secret.md>',
    '<a href="../outside.md">outside</a>',
    '<img src="missing.png">',
    'Inline <img src="missing.png"> image',
  ])
    assert.throws(
      () => validateBundle(new Map([['SKILL.md', Buffer.from(text)]])),
      /Unsupported reference URL|Use Markdown/,
    );
});

test('source and output ancestor symlinks are refused without writing through them', async (t) => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'exhibit-skill-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(root, 'plugins'), 'dir');
  await assert.rejects(packageSkills({ root }), /Symlink/);
  assert.equal((await inventory(outside)).size, 0);
  await rm(join(root, 'plugins'));
  await symlink(join(root, 'LICENSE'), join(root, 'src/skills/exhibit-publish/linked'), 'file');
  await assert.rejects(expectedBundles(root), /symlinks/);
});

test('deployment reference preserves the actual CSP and doctor failure envelope', async () => {
  const deployment = await readFile(
    join(repository, 'src/skills/exhibit-setup/references/deployment.md'),
    'utf8',
  );
  assert.ok(deployment.includes(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`));
  assert.ok(deployment.includes('error.details.cleanup_key'));
  assert.ok(deployment.includes('data.cleanup_key'));
});
