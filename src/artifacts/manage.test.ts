import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, date, memory, object, s3Error } from '#core/fixtures.test-support';
import { listArtifacts, removeArtifact } from './manage.js';
import { publishArtifact } from './publish.js';
describe('remote inventory and removal', () => {
  it('retains the password when a DELETE 404 does not establish remote absence', async () => {
    const { store, state, transport } = memory();
    const artifact = await store.put(object('plan'));
    await state.save({
      schemaVersion: 1,
      slug: 'plan',
      bodySha256: artifact.bodySha256,
      etag: artifact.etag,
      status: 'published',
      password: 'only-fixture-password',
      url: 'https://example.test/plan.html',
      savedAt: date,
    });
    transport.remove = async () => {
      transport.head = async () => {
        throw s3Error('UnknownError', 404);
      };
      throw s3Error('UnknownError', 404);
    };
    await assert.rejects(removeArtifact(store, state, 'plan'), { code: 'E_STORAGE' });
    assert.equal(transport.objects.size, 1);
    assert.equal(
      (await state.read('plan', artifact.bodySha256))?.password,
      'only-fixture-password',
    );
  });
  it('retains receipts when an already-absent DELETE response only infers absence', async () => {
    const { store, state, transport } = memory();
    const artifact = await store.put(object('plan'));
    const staleDigest = 'a'.repeat(64);
    for (const digest of [artifact.bodySha256, staleDigest])
      await state.save({
        schemaVersion: 1,
        slug: 'plan',
        bodySha256: digest,
        etag: artifact.etag,
        status: 'published',
        password: 'fixture-password',
        url: 'https://example.test/plan.html',
        savedAt: date,
      });
    const remove = transport.remove.bind(transport);
    transport.remove = async (request) => {
      await remove(request);
      throw s3Error('NoSuchKey', 404);
    };
    const result = await removeArtifact(store, state, 'plan');
    assert.equal(result.removed, false);
    assert.equal(result.warnings[0]?.code, 'W_DELETE_UNCONFIRMED');
    assert.ok(await state.read('plan', artifact.bodySha256));
    assert.ok(await state.read('plan', staleDigest));
    assert.equal(transport.deletes[0]?.IfMatch, artifact.etag);
  });
  it('retains the recovery password when a delayed delete overlaps an uncertain new publish', async () => {
    const { store, state } = memory();
    const old = await store.put(object('plan', 'old'));
    await removeArtifact(
      {
        ...store,
        async remove(slug, etag) {
          const outcome = await store.remove(slug, etag);
          await assert.rejects(
            publishArtifact(
              { file: 'fixture.html', slug: 'plan', password: 'new-fixture-password' },
              {
                config,
                state,
                store: {
                  ...store,
                  async put(input) {
                    await store.put(input);
                    throw new Error('fixture lost PUT response');
                  },
                },
                read: async () => ({ text: 'fixture', type: 'html', title: 'fixture' }),
                render: async () => ({ html: 'fixture', warnings: [] }),
                protect: async () => 'new encrypted fixture',
              },
            ),
          );
          return outcome;
        },
      },
      state,
      'plan',
    );
    const current = await store.head('plan');
    assert.ok(current);
    assert.notEqual(current.bodySha256, old.bodySha256);
    assert.equal((await state.read('plan', current.bodySha256))?.password, 'new-fixture-password');
  });
  it('retains the only password when a backend serves a stale empty listing after DELETE 404', async () => {
    const { store, state, transport } = memory();
    const artifact = await store.put(object('plan'));
    await state.save({
      schemaVersion: 1,
      slug: 'plan',
      bodySha256: artifact.bodySha256,
      etag: artifact.etag,
      status: 'published',
      password: 'only-fixture-password',
      url: 'https://example.test/plan.html',
      savedAt: date,
    });
    transport.remove = async () => {
      throw s3Error('UnknownError', 404);
    };
    transport.list = async () => ({ IsTruncated: false, Contents: [] });
    const result = await removeArtifact(store, state, 'plan');
    assert.equal(result.removed, false);
    assert.equal(transport.objects.size, 1);
    assert.equal(
      (await state.read('plan', artifact.bodySha256))?.password,
      'only-fixture-password',
    );
    assert.match(result.warnings[0]!.message, new RegExp(`--forget ${artifact.bodySha256}`));
  });
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
