import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, mkdir, symlink, writeFile, readFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'vitest';
import { config, date } from '#core/fixtures.test-support';
import { deploymentId, scopeDirectory } from '#core/identity';
import type { PublicationReceipt } from '#core/types';
import { createPublicationState, enumerateReceipts } from './store.js';

describe('local password receipts', () => {
  it('keeps receipts for both revisions and reads only matching ciphertext identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'exhibit-state-'));
    try {
      const state = createPublicationState(config, root);
      const a = 'a'.repeat(64);
      const b = 'b'.repeat(64);
      const base = {
        schemaVersion: 1 as const,
        slug: 'plan',
        etag: null,
        url: 'https://example.test/plan.html',
        status: 'prepared' as const,
        savedAt: date,
      };
      await state.save({ ...base, bodySha256: a, password: 'first-fixture-password' });
      await state.save({ ...base, bodySha256: b, password: 'second-fixture-password' });
      assert.equal((await state.read('plan', a))?.password, 'first-fixture-password');
      assert.equal((await state.read('plan', b))?.password, 'second-fixture-password');
      assert.equal(await state.read('plan', 'c'.repeat(64)), null);
      if (process.platform !== 'win32')
        assert.equal(
          (await stat(join(root, deploymentId(config), 'plan', a + '.json'))).mode & 0o777,
          0o600,
        );
      await state.remove('plan', a);
      assert.equal(await state.read('plan', a), null);
      assert.equal((await state.read('plan', b))?.password, 'second-fixture-password');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects path traversal in state identities', async () => {
    const state = createPublicationState(config, '/unused');
    await assert.rejects(state.read('../bad', 'a'.repeat(64)));
    await assert.rejects(state.read('plan', '../bad'));
  });

  for (const level of ['root', 'deployment', 'slug'] as const) {
    it(`refuses receipt reads and deletes through a symlinked ${level}`, async () => {
      const temporary = await mkdtemp(join(tmpdir(), 'exhibit-parent-link-'));
      try {
        const root = join(temporary, 'state');
        const deployment = join(root, deploymentId(config));
        const slug = join(deployment, 'plan');
        const external = join(temporary, 'external');
        const digest = 'a'.repeat(64);
        await mkdir(external, { mode: 0o700 });
        const linked = level === 'root' ? root : level === 'deployment' ? deployment : slug;
        if (level !== 'root') await mkdir(root, { mode: 0o700 });
        if (level === 'slug') await mkdir(deployment, { mode: 0o700 });
        await symlink(external, linked, 'junction');
        const receiptDir =
          level === 'root'
            ? join(external, deploymentId(config), 'plan')
            : level === 'deployment'
              ? join(external, 'plan')
              : external;
        await mkdir(receiptDir, { recursive: true, mode: 0o700 });
        const receipt = join(receiptDir, `${digest}.json`);
        await writeFile(receipt, 'untouched', { mode: 0o600 });
        const state = createPublicationState(config, root);
        await assert.rejects(state.read('plan', digest), { code: 'E_STATE' });
        await assert.rejects(state.remove('plan', digest), { code: 'E_STATE' });
        await assert.rejects(enumerateReceipts(config, root, 'plan'), { code: 'E_STATE' });
        assert.equal(await readFile(receipt, 'utf8'), 'untouched');
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    });
  }

  it('rejects nonprivate receipt parent directories on POSIX', async () => {
    if (process.platform === 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'exhibit-shared-state-'));
    try {
      await chmod(root, 0o755);
      const state = createPublicationState(config, root);
      await assert.rejects(state.read('plan', 'a'.repeat(64)), { code: 'E_STATE' });
      await assert.rejects(state.remove('plan', 'a'.repeat(64)), { code: 'E_STATE' });
      await assert.rejects(enumerateReceipts(config, root, 'plan'), { code: 'E_STATE' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('local receipt inventory', () => {
  const prepared: PublicationReceipt = {
    schemaVersion: 1,
    slug: 'plan',
    etag: null,
    url: 'https://example.test/plan.html',
    status: 'prepared',
    savedAt: date,
    bodySha256: 'a'.repeat(64),
    password: 'inventory-fixture-password',
  };

  it('returns all revisions in digest order and forgets only the exact digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'exhibit-inventory-'));
    try {
      const state = createPublicationState(config, root);
      const published: PublicationReceipt = {
        ...prepared,
        bodySha256: 'b'.repeat(64),
        status: 'published',
        etag: 'fixture-etag',
        password: null,
      };
      await state.save(published);
      await state.save(prepared);
      assert.deepEqual(await enumerateReceipts(config, root, 'plan'), [prepared, published]);
      assert.deepEqual(await state.read('plan', prepared.bodySha256), prepared);
      await state.remove('plan', prepared.bodySha256);
      assert.deepEqual(await enumerateReceipts(config, root, 'plan'), [published]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not inspect other slugs, deployments, or directory scopes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'exhibit-inventory-scope-'));
    try {
      await createPublicationState(config, root).save(prepared);
      const scoped = scopeDirectory(config, 'projects/review');
      const other = { ...config, publicBaseUrl: 'https://other.example.test' };
      for (const [deploymentConfig, slug] of [
        [config, 'other'],
        [scoped, 'plan'],
        [other, 'plan'],
      ] as const) {
        const directory = join(root, deploymentId(deploymentConfig), slug);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(join(directory, 'unknown'), 'not a receipt', { mode: 0o600 });
      }
      assert.deepEqual(await enumerateReceipts(config, root, 'plan'), [prepared]);
      await assert.rejects(enumerateReceipts(scoped, root, 'plan'), { code: 'E_STATE' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns an empty inventory for missing directories without creating state', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'exhibit-inventory-missing-'));
    try {
      const root = join(temporary, 'state');
      const deployment = join(root, deploymentId(config));
      const directory = join(deployment, 'plan');
      for (const missing of [root, deployment, directory]) {
        assert.deepEqual(await enumerateReceipts(config, root, 'plan'), []);
        await assert.rejects(stat(missing), { code: 'ENOENT' });
        await mkdir(missing, { mode: 0o700 });
      }
      assert.deepEqual(await enumerateReceipts(config, root, 'plan'), []);
      await assert.rejects(enumerateReceipts(config, root, '../bad'), { code: 'E_SLUG' });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  for (const defect of [
    'unknown file',
    'temporary file',
    'invalid JSON',
    'invalid schema',
    'wrong slug',
    'wrong digest',
    'oversized receipt',
    'receipt directory',
    'receipt symlink',
    'nonprivate receipt',
    'nonprivate deployment',
    'nonprivate slug',
  ]) {
    it(`fails closed for ${defect} without deleting any receipts`, async () => {
      if (process.platform === 'win32' && defect.startsWith('nonprivate')) return;
      const root = await mkdtemp(join(tmpdir(), 'exhibit-inventory-invalid-'));
      try {
        const state = createPublicationState(config, root);
        await state.save(prepared);
        const deployment = join(root, deploymentId(config));
        const directory = join(deployment, 'plan');
        const target = join(directory, `${'b'.repeat(64)}.json`);
        const candidate = { ...prepared, bodySha256: 'b'.repeat(64) };
        switch (defect) {
          case 'unknown file':
            await writeFile(join(directory, 'unknown.json'), '{}', { mode: 0o600 });
            break;
          case 'temporary file':
            await writeFile(join(directory, '.exhibit-fixture.tmp'), '{}', { mode: 0o600 });
            break;
          case 'invalid JSON':
            await writeFile(target, 'invalid fixture content', { mode: 0o600 });
            break;
          case 'invalid schema':
            await writeFile(target, JSON.stringify({ ...candidate, status: 'unknown' }), {
              mode: 0o600,
            });
            break;
          case 'wrong slug':
            await writeFile(target, JSON.stringify({ ...candidate, slug: 'other' }), {
              mode: 0o600,
            });
            break;
          case 'wrong digest':
            await writeFile(target, JSON.stringify(prepared), { mode: 0o600 });
            break;
          case 'oversized receipt':
            await writeFile(target, JSON.stringify({ ...candidate, password: 'x'.repeat(65536) }), {
              mode: 0o600,
            });
            break;
          case 'receipt directory':
            await mkdir(target, { mode: 0o700 });
            break;
          case 'receipt symlink':
            await symlink(join(directory, `${prepared.bodySha256}.json`), target);
            break;
          case 'nonprivate receipt':
            await state.save(candidate);
            await chmod(target, 0o644);
            break;
          case 'nonprivate deployment':
            await chmod(deployment, 0o755);
            break;
          case 'nonprivate slug':
            await chmod(directory, 0o755);
            break;
        }
        await assert.rejects(enumerateReceipts(config, root, 'plan'), (error: unknown) => {
          assert.ok(error instanceof Error && 'code' in error);
          assert.equal(error.code, 'E_STATE');
          assert.ok(!error.message.includes(root));
          assert.ok(!error.message.includes(prepared.password!));
          assert.ok(!error.message.includes('invalid fixture content'));
          return true;
        });
        assert.deepEqual(
          JSON.parse(await readFile(join(directory, `${prepared.bodySha256}.json`), 'utf8')),
          prepared,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
