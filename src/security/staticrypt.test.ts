import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'vitest';
import { createProtector } from './staticrypt.js';

describe('pinned upstream StatiCrypt codec', () => {
  const password = 'test-fixture-not-a-real-password';
  it('round-trips Unicode HTML using upstream encryption', async () => {
    const p = createProtector();
    const html = '<h1>Private αβ 🚀</h1>';
    const encrypted = await p.encrypt(html, password);
    assert.equal(await p.decrypt(encrypted, password), html);
    assert.equal(encrypted.ciphertext.includes('Private'), false);
  });
  it('rejects the wrong password', async () => {
    const p = createProtector();
    const encrypted = await p.encrypt('secret', password);
    assert.equal(await p.decrypt(encrypted, 'a-different-fixture-password'), null);
  });
  it('rejects tampered ciphertext', async () => {
    const p = createProtector();
    const c = await p.encrypt('secret', password);
    const last = c.ciphertext.endsWith('a') ? 'b' : 'a';
    assert.equal(
      await p.decrypt({ ...c, ciphertext: c.ciphertext.slice(0, -1) + last }, password),
      null,
    );
  });
  it('uses a fresh salt and IV for identical input/password', async () => {
    const p = createProtector();
    const a = await p.encrypt('same', password);
    const b = await p.encrypt('same', password);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });
  it('executes the browser-source branch using WebCrypto without require or Node globals', async () => {
    const protector = createProtector();
    const encrypted = await protector.encrypt('<p>browser branch</p>', password);
    const source = await protector.browserSource();
    const browser = runInNewContext(`${source}\n({ engine: exhibitEngine, codec: exhibitCodec })`, {
      window: { crypto: webcrypto },
      Uint8Array,
      TextEncoder,
      TextDecoder,
    }) as {
      engine: { hashPassword(password: string, salt: string): Promise<string> };
      codec: {
        decode(
          ciphertext: string,
          hash: string,
          salt: string,
        ): Promise<{ success: boolean; decoded: string }>;
      };
    };
    const hash = await browser.engine.hashPassword(password, encrypted.salt);
    const result = await browser.codec.decode(encrypted.ciphertext, hash, encrypted.salt);
    assert.equal(result.success, true);
    assert.equal(result.decoded, '<p>browser branch</p>');
    assert.ok(source.includes('Copyright (c) 2017 Robin Moisson'));
    assert.ok(source.includes('Permission is hereby granted'));
  });
  it('bundles upstream browser code without external URLs/scripts', async () => {
    const source = await createProtector().browserSource();
    assert.ok(source.includes('exhibitEngine'));
    assert.ok(source.includes('exports.init'));
    assert.equal(/<script[^>]+src=/.test(source), false);
  });
});
