import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { loadConfig, parseConfig, saveConfig } from './config.js';
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
      'https://host.test/share#',
      'https://host.test/share?',
    ])
      assert.throws(() => parseConfig({ ...input, publicBaseUrl: url }));
  });
  it('rejects bare query and fragment delimiters on storage endpoints', () => {
    for (const endpoint of ['https://storage.test#', 'https://storage.test?'])
      assert.throws(() => parseConfig({ ...input, storage: { ...input.storage, endpoint } }), {
        code: 'E_CONFIG',
      });
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

describe('config file errors', () => {
  it('uses config-specific errors for invalid files without leaking paths or content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exhibit-config-'));
    try {
      const oversized = join(directory, 'secret-path-oversized');
      const malformed = join(directory, 'secret-path-encoding');
      const link = join(directory, 'secret-path-link');
      const invalidJson = join(directory, 'secret-path-json');
      await writeFile(oversized, 'secret-config-content'.repeat(4000));
      await writeFile(malformed, Buffer.from([0xff, 0xfe]));
      await writeFile(invalidJson, 'secret-config-content');
      await symlink(oversized, link);
      for (const path of [directory, oversized, malformed, link, invalidJson]) {
        await assert.rejects(loadConfig(path), (error: unknown) => {
          assert.equal((error as { code: string }).code, 'E_CONFIG');
          assert.equal(JSON.stringify(error).includes('secret-'), false);
          return true;
        });
      }
      await assert.rejects(loadConfig(join(directory, 'missing')), { code: 'E_CONFIG_NOT_FOUND' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('uses config-specific write errors and preserves the existing-config distinction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exhibit-config-'));
    try {
      const path = join(directory, 'config.json');
      await saveConfig(path, input);
      await assert.rejects(saveConfig(path, input), { code: 'E_CONFIG_EXISTS' });
      const unsafe = join(directory, 'unsafe');
      await mkdir(unsafe);
      await assert.rejects(saveConfig(unsafe, input, true), { code: 'E_CONFIG' });
      await assert.rejects(saveConfig(join(path, 'child.json'), input), { code: 'E_CONFIG' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
