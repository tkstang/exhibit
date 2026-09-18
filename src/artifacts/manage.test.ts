import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, date, memory, object } from '#core/fixtures.test-support';
import { listArtifacts, removeArtifact } from './manage.js';
describe('remote inventory and removal', () => {
  it('never shows local passwords without an explicit flag', async () => {
    const { store, state } = memory();
    const a = await store.put(object('plan'));
    await state.save({
      schemaVersion: 1,
      slug: 'plan',
      bodySha256: a.bodySha256,
      etag: a.etag,
      status: 'published',
      password: 'fixture-password-value',
      url: 'https://share.example.test/plan.html',
      savedAt: date,
    });
    const hidden = await listArtifacts(config, store, state, { limit: 100 });
    assert.equal(JSON.stringify(hidden).includes('fixture-password-value'), false);
    const shown = await listArtifacts(config, store, state, { limit: 100, showPasswords: true });
    assert.equal(shown.artifacts[0]?.password, 'fixture-password-value');
  });
  it('does not match a stale key to new remote content', async () => {
    const { store, state } = memory();
    const old = await store.put(object('plan', 'old'));
    await state.save({
      schemaVersion: 1,
      slug: 'plan',
      bodySha256: old.bodySha256,
      etag: old.etag,
      status: 'published',
      password: 'old-fixture-password',
      url: 'https://share.example.test/plan.html',
      savedAt: date,
    });
    await store.put({ ...object('plan', 'new'), expectedEtag: old.etag });
    assert.equal(
      (await listArtifacts(config, store, state, { limit: 100, showPasswords: true })).artifacts[0]
        ?.password,
      null,
    );
  });
  it('supports preview and actual exact-object removal', async () => {
    const { store, state } = memory();
    await store.put(object('plan'));
    const preview = await removeArtifact(store, state, 'plan', { dryRun: true });
    assert.equal(preview.removed, false);
    assert.ok(await store.head('plan'));
    const removed = await removeArtifact(store, state, 'plan');
    assert.equal(removed.removed, true);
    assert.equal(await store.head('plan'), null);
  });
  it('only tolerates missing objects when requested', async () => {
    const { store, state } = memory();
    await assert.rejects(removeArtifact(store, state, 'gone'), { code: 'E_NOT_FOUND' });
    assert.equal((await removeArtifact(store, state, 'gone', { missingOk: true })).removed, false);
  });
});
