import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, memory, object, s3Error, MemoryTransport } from '#core/fixtures.test-support';
import { buildPutRequest, createS3Store, translateS3Error } from './s3-store.js';

describe('S3 artifact adapter', () => {
  it('sets inline HTML/no-store with a create-only condition', () => {
    const r = buildPutRequest(config, object());
    assert.equal(r.ContentType, 'text/html; charset=utf-8');
    assert.equal(r.ContentDisposition, 'inline');
    assert.equal(r.CacheControl, 'no-store, max-age=0');
    assert.equal(r.IfNoneMatch, '*');
    assert.equal(r.IfMatch, undefined);
  });
  it('does not include passwords, paths or titles in metadata', () => {
    const r = buildPutRequest(config, object());
    assert.deepEqual(Object.keys(r.Metadata).sort(), [
      'exhibit-body-sha256',
      'exhibit-created-at',
      'exhibit-format',
      'exhibit-kind',
      'exhibit-protected',
      'exhibit-type',
      'exhibit-updated-at',
    ]);
  });
  it('supports conditional overwrite and rejects stale updates', async () => {
    const { store } = memory();
    const one = await store.put(object());
    await assert.rejects(store.put(object()), { code: 'E_CONFLICT' });
    const two = await store.put({ ...object('fixture', 'updated'), expectedEtag: one.etag });
    assert.notEqual(one.etag, two.etag);
    await assert.rejects(store.put({ ...object(), expectedEtag: one.etag }), {
      code: 'E_CONFLICT',
    });
  });
  it('only deletes with the observed ETag', async () => {
    const { store, transport } = memory();
    const saved = await store.put(object());
    await assert.rejects(store.remove(saved.slug, 'wrong'), { code: 'E_CONFLICT' });
    await store.remove(saved.slug, saved.etag);
    assert.equal(await store.head(saved.slug), null);
    assert.equal(transport.deletes[0]?.IfMatch, saved.etag);
  });
  it('refuses unrecognized objects', async () => {
    const { store, transport } = memory();
    await transport.put({ ...buildPutRequest(config, object()), Metadata: {} });
    await assert.rejects(store.head('fixture'), { code: 'E_NOT_MANAGED' });
    assert.equal((await store.list({ limit: 100 })).artifacts.length, 0);
  });
  it('paginates remote state, not local receipts', async () => {
    const { store } = memory();
    for (const slug of ['one', 'two', 'three']) await store.put(object(slug));
    const first = await store.list({ limit: 2 });
    assert.equal(first.artifacts.length, 2);
    assert.ok(first.nextCursor);
    const second = await store.list({ limit: 2, cursor: first.nextCursor! });
    assert.equal(second.artifacts.length, 1);
    assert.equal(second.nextCursor, null);
  });
  it('excludes diagnostic probes from listings', async () => {
    const { store } = memory();
    await store.put({ ...object('doctor-thing'), kind: 'probe' });
    assert.equal((await store.list({ limit: 100 })).artifacts.length, 0);
  });
  it('rejects invalid limits and traversal slugs', async () => {
    const { store } = memory();
    await assert.rejects(store.list({ limit: 0 }));
    await assert.rejects(store.put(object('../bad')));
  });
  it('translates structured AWS failures without exposing raw messages', () => {
    const error = translateS3Error({
      ...s3Error('AccessDenied', 403),
      message: 'secret credential',
    });
    assert.equal(error.code, 'E_BUCKET_ACCESS');
    assert.equal(error.message.includes('secret credential'), false);
    assert.equal(translateS3Error({ name: 'CredentialsProviderError' }).code, 'E_CREDENTIALS');
  });
  it('does not mistake a missing bucket for an empty prefix', async () => {
    const transport = new MemoryTransport();
    transport.head = async () => {
      throw s3Error('NoSuchBucket', 404);
    };
    await assert.rejects(createS3Store(config, transport).head('plan'), {
      code: 'E_BUCKET_ACCESS',
    });
  });
  it('rejects malformed truncated provider responses', async () => {
    const transport = new MemoryTransport();
    transport.list = async () => ({ IsTruncated: true });
    await assert.rejects(createS3Store(config, transport).list({ limit: 10 }), {
      code: 'E_STORAGE',
    });
  });
});
