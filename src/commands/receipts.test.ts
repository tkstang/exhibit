import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'vitest';
import { config, date } from '#core/fixtures.test-support';
import { ExhibitError } from '#core/errors';
import { scopeDirectory } from '#core/identity';
import { createPublicationState } from '#state/store';
import { run } from './run.js';
import { diagnostics, humanOutput } from './output.js';

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
    assert.match(humanOutput(listing.envelope), /Local receipts for plan/);
    assert.match(humanOutput(listing.envelope), /prepared/);
    assert.equal(humanOutput(listing.envelope).includes(password), false);
    assert.equal(humanOutput(listing.envelope).includes('W_LOCAL_RECEIPTS'), false);
    assert.ok(listing.envelope.ok);
    assert.equal((listing.envelope.data as { receipts: unknown[] }).receipts.length, 2);
    const revealed = await run([...argv, '--show-passwords'], deps);
    assert.equal(revealed.exitCode, 0);
    assert.equal(JSON.stringify(revealed).includes(password), true);
    assert.equal(diagnostics(revealed.envelope).includes(password), false);
    assert.match(humanOutput(revealed.envelope), /Password: private-fixture-password/);
    const unscoped = await run(['receipts', 'plan', '--json'], deps);
    assert.ok(unscoped.envelope.ok);
    assert.deepEqual((unscoped.envelope.data as { receipts: unknown[] }).receipts, []);
    assert.match(humanOutput(unscoped.envelope), /No local receipts/);
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
      assert.match(diagnostics(result.envelope), /W_LOCAL_RECEIPTS/);
      assert.ok(await state.read('plan', digest));
    }
    const preview = await run([...argv, '--forget', digest, '--dry-run'], deps);
    assert.equal(preview.exitCode, 0);
    assert.match(humanOutput(preview.envelope), /Would forget local receipt: plan/);
    assert.match(humanOutput(preview.envelope), new RegExp(digest));
    assert.ok(await state.read('plan', digest));
    const forgotten = await run([...argv, '--forget', digest, '--force'], deps);
    assert.equal(forgotten.exitCode, 0);
    assert.equal(JSON.stringify(forgotten).includes(password), false);
    assert.match(humanOutput(forgotten.envelope), /Forgot local receipt: plan/);
    assert.equal(humanOutput(forgotten.envelope).includes('W_FORGET_PASSWORD'), false);
    assert.equal(await state.read('plan', digest), null);
    assert.ok(await state.read('plan', other));
    const absent = await run([...argv, '--forget', digest, '--force'], deps);
    assert.ok(!absent.envelope.ok);
    assert.equal(absent.envelope.error.code, 'E_NOT_FOUND');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('uses a local factory with scoped configuration and preserves receipt failure warnings', async () => {
  const factoryCalls: { config: typeof config; stateDir: string }[] = [];
  const operations: string[] = [];
  const digest = 'c'.repeat(64);
  const deps = {
    env: { EXHIBIT_STATE_DIR: '/unused-receipt-fixture' },
    loadConfig: async () => config,
    session: async (): Promise<never> => {
      throw new Error('must not open cloud session');
    },
    receipts: async (scopedConfig: typeof config, stateDir: string) => {
      factoryCalls.push({ config: scopedConfig, stateDir });
      return {
        enumerate: async (slug: string) => {
          operations.push(`list:${slug}`);
          return [];
        },
        state: {
          read: async (slug: string, bodySha256: string) => {
            operations.push(`read:${slug}:${bodySha256}`);
            return {
              schemaVersion: 1 as const,
              slug,
              bodySha256,
              status: 'prepared' as const,
              savedAt: date,
              url: 'https://example.test/plan.html',
              etag: null,
              password: 'injected-private-password',
            };
          },
          remove: async (slug: string, bodySha256: string) => {
            operations.push(`remove:${slug}:${bodySha256}`);
            throw new ExhibitError('E_STATE', 'Could not remove local receipt.');
          },
        },
      };
    },
  };
  const argv = ['receipts', 'plan', '--dir', 'repositories/test/', '--json'];
  const listing = await run(argv, deps);
  assert.ok(listing.envelope.ok);
  const failed = await run([...argv, '--forget', digest, '--force'], deps);
  assert.ok(!failed.envelope.ok);
  assert.equal(failed.envelope.error.code, 'E_STATE');
  assert.deepEqual(
    failed.envelope.warnings.map((warning) => warning.code),
    ['W_LOCAL_RECEIPTS', 'W_FORGET_PASSWORD'],
  );
  assert.equal(JSON.stringify(failed).includes('injected-private-password'), false);
  assert.equal(diagnostics(failed.envelope).includes('injected-private-password'), false);
  assert.deepEqual(operations, ['list:plan', `read:plan:${digest}`, `remove:plan:${digest}`]);
  assert.deepEqual(
    factoryCalls,
    Array.from({ length: 2 }, () => ({
      config: scopeDirectory(config, 'repositories/test'),
      stateDir: '/unused-receipt-fixture',
    })),
  );
});
