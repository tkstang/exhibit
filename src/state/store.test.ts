import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, mkdir, symlink, writeFile, readFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'vitest';
import { config, date } from '#core/fixtures.test-support';
import { deploymentId } from '#core/identity';
import { createPublicationState } from './store.js';

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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
