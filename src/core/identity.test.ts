import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config } from './fixtures.test-support.js';
import {
  deploymentId,
  generateSlug,
  normalizePrefix,
  objectKey,
  publicUrl,
  requireSlug,
  validateSlug,
} from './identity.js';

describe('artifact identity', () => {
  it('accepts bounded safe slugs', () => {
    for (const slug of ['a', 'a-b', '123', 'a'.repeat(64)]) assert.equal(requireSlug(slug), slug);
  });
  it('rejects traversal, encoding, slashes, and ambiguous slugs', () => {
    for (const slug of [
      '',
      '../a',
      'a/b',
      'a\\b',
      '%2e%2e',
      'a.html',
      '-a',
      'a-',
      'A',
      'a'.repeat(65),
      'a?x',
      'a#x',
      'a\n',
    ])
      assert.equal(validateSlug(slug).ok, false, slug);
  });
  it('generates opaque distinct valid names', () => {
    const names = new Set(Array.from({ length: 200 }, generateSlug));
    assert.equal(names.size, 200);
    for (const name of names) assert.equal(requireSlug(name), name);
  });
  it('normalizes a nonempty prefix once', () => {
    assert.equal(normalizePrefix('team/exhibit'), 'team/exhibit/');
    assert.equal(normalizePrefix(''), '');
  });
  it('rejects unsafe prefixes', () => {
    for (const prefix of ['/a', 'a//b', 'a/../b', './x', 'a/%2f', 'a\\b'])
      assert.throws(() => normalizePrefix(prefix));
  });
  it('maps the origin prefix independently of the public URL', () => {
    assert.equal(objectKey(config, 'plan'), 'exhibit/plan.html');
    assert.equal(publicUrl(config, 'plan'), 'https://share.example.test/plan.html');
    assert.equal(
      publicUrl({ ...config, publicBaseUrl: 'https://example.test/reviews/' }, 'plan'),
      'https://example.test/reviews/plan.html',
    );
  });
  it('namespaces state by deployment', () => {
    assert.equal(deploymentId(config), deploymentId({ ...config }));
    assert.notEqual(
      deploymentId(config),
      deploymentId({ ...config, storage: { ...config.storage, prefix: 'other/' } }),
    );
  });
});
