import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseConfig } from './config.js';
const input = {
  storage: { bucket: 'my-artifacts', region: 'us-east-1' },
  publicBaseUrl: 'https://share.example.test',
};
describe('Zod config boundary', () => {
  it('fills safe defaults', () => {
    const c = parseConfig(input);
    assert.equal(c.storage.prefix, 'exhibit/');
    assert.equal(c.schemaVersion, 1);
    assert.equal(c.brand.name, 'Exhibit');
  });
  it('rejects cloud credentials in config', () => {
    assert.throws(
      () => parseConfig({ ...input, storage: { ...input.storage, accessKeyId: 'dont-store-me' } }),
      { code: 'E_CONFIG' },
    );
  });
  it('rejects remote HTTP endpoints', () => {
    assert.throws(
      () =>
        parseConfig({
          ...input,
          storage: { ...input.storage, endpoint: 'http://storage.example.test' },
        }),
      { code: 'E_CONFIG' },
    );
  });
  it('allows local HTTP for test servers', () => {
    assert.equal(
      parseConfig({ ...input, publicBaseUrl: 'http://localhost:8000' }).publicBaseUrl,
      'http://localhost:8000',
    );
  });
  it('rejects public URL credentials, query and fragment', () => {
    for (const url of [
      'https://user:secret@host.test',
      'https://host.test?q=1',
      'https://host.test/#password',
    ])
      assert.throws(() => parseConfig({ ...input, publicBaseUrl: url }));
  });
  it('rejects unsafe prefixes and accents', () => {
    assert.throws(() =>
      parseConfig({ ...input, storage: { ...input.storage, prefix: '../secret' } }),
    );
    assert.throws(() => parseConfig({ ...input, brand: { accent: 'red;display:none' } }));
  });
  it('caps document size', () => {
    assert.throws(() => parseConfig({ ...input, maxInputBytes: 100_000_000 }));
  });
});
