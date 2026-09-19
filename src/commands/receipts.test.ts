import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'vitest';
import { config, date } from '#core/fixtures.test-support';
import { scopeDirectory } from '#core/identity';
import { createPublicationState } from '#state/store';
import { run } from './run.js';
import { diagnostics } from './output.js';

it('inspects and forgets only exact local receipts, without opening a cloud session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'exhibit-receipts-cli-'));
  const scope = scopeDirectory(config, 'repositories/test');
  const state = createPublicationState(scope, dir);
  const digest = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  const password = 'private-fixture-password';
  const deps = {
    env: { EXHIBIT_STATE_DIR: dir },
    loadConfig: async () => config,
    session: async (): Promise<never> => {
      throw new Error('must not open cloud session');
    },
  };
  const argv = ['receipts', 'plan', '--dir', 'repositories/test', '--json'];
  try {
    for (const bodySha256 of [digest, other])
      await state.save({
        schemaVersion: 1,
        slug: 'plan',
        url: 'https://example.test/plan.html',
        bodySha256,
        password,
        status: 'prepared',
        etag: null,
        savedAt: date,
      });
    const listing = await run(argv, deps);
    assert.equal(listing.exitCode, 0);
    assert.equal(JSON.stringify(listing).includes(password), false);
    assert.equal(diagnostics(listing.envelope).includes(password), false);
    assert.ok(listing.envelope.ok);
    assert.equal((listing.envelope.data as { receipts: unknown[] }).receipts.length, 2);
    const revealed = await run([...argv, '--show-passwords'], deps);
    assert.equal(revealed.exitCode, 0);
    assert.equal(JSON.stringify(revealed).includes(password), true);
    assert.equal(diagnostics(revealed.envelope).includes(password), false);
    const unscoped = await run(['receipts', 'plan', '--json'], deps);
    assert.ok(unscoped.envelope.ok);
    assert.deepEqual((unscoped.envelope.data as { receipts: unknown[] }).receipts, []);
    for (const flags of [
      ['--forget', digest],
      ['--forget', '../bad', '--force'],
      ['--force'],
      ['--dry-run'],
      ['--forget', digest, '--force', '--show-passwords'],
    ]) {
      const result = await run([...argv, ...flags], deps);
      assert.ok(!result.envelope.ok);
      assert.equal(result.envelope.error.code, 'E_USAGE');
      assert.ok(await state.read('plan', digest));
    }
    assert.equal((await run([...argv, '--forget', digest, '--dry-run'], deps)).exitCode, 0);
    assert.ok(await state.read('plan', digest));
    const forgotten = await run([...argv, '--forget', digest, '--force'], deps);
    assert.equal(forgotten.exitCode, 0);
    assert.equal(JSON.stringify(forgotten).includes(password), false);
    assert.equal(await state.read('plan', digest), null);
    assert.ok(await state.read('plan', other));
    const absent = await run([...argv, '--forget', digest, '--force'], deps);
    assert.ok(!absent.envelope.ok);
    assert.equal(absent.envelope.error.code, 'E_NOT_FOUND');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
