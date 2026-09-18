import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config } from './fixtures.test-support.js';
import {
  deploymentId,
  generateSlug,
  normalizePrefix,
  normalizeDirectory,
  scopeDirectory,
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
  it('scopes keys, URLs, and receipt identity together without changing the root', () => {
    const scoped = scopeDirectory(config, 'internal/projects/redesign');
    assert.equal(objectKey(scoped, 'plan'), 'exhibit/internal/projects/redesign/plan.html');
    assert.equal(
      publicUrl(scoped, 'plan'),
      'https://share.example.test/internal/projects/redesign/plan.html',
    );
    assert.notEqual(deploymentId(scoped), deploymentId(config));
    assert.equal(
      deploymentId(scoped),
      deploymentId(scopeDirectory(config, 'internal/projects/redesign/')),
    );
    assert.equal(scopeDirectory(config), config);
    assert.equal(config.storage.prefix, 'exhibit/');
    const pathBase = scopeDirectory(
      {
        ...config,
        storage: { ...config.storage, prefix: '' },
        publicBaseUrl: 'https://example.test/share/',
      },
      'team',
    );
    assert.equal(objectKey(pathBase, 'plan'), 'team/plan.html');
    assert.equal(publicUrl(pathBase, 'plan'), 'https://example.test/share/team/plan.html');
  });
  it('rejects unsafe or ambiguous directories without echoing their contents', () => {
    for (const directory of [
      '',
      '/',
      '/internal',
      '.',
      '..',
      'a/../b',
      'a/./b',
      'a//b',
      'a//',
      'a\\b',
      'C:/secret',
      '%2e%2e',
      'a/%252f',
      'https://host',
      'a?token=secret',
      'a#secret',
      'a\n',
      'a ',
      'a'.repeat(513),
    ]) {
      assert.throws(() => normalizeDirectory(directory), {
        code: 'E_USAGE',
        message: 'Invalid --dir path.',
      });
    }
    assert.equal(normalizeDirectory('repositories/Example_1.0/'), 'repositories/Example_1.0/');
  });
  it('bounds the combined directory and configured prefix/URL', () => {
    assert.throws(() => scopeDirectory(config, 'a'.repeat(512)), { code: 'E_USAGE' });
    assert.throws(
      () =>
        scopeDirectory(
          { ...config, publicBaseUrl: `https://example.test/${'a'.repeat(2025)}` },
          'team',
        ),
      { code: 'E_USAGE' },
    );
  });
});
