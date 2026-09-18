import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { generatePassword, validatePassword } from './password.js';
describe('passwords', () => {
  it('generates 32 URL-safe random characters', () => {
    const set = new Set(Array.from({ length: 200 }, generatePassword));
    assert.equal(set.size, 200);
    for (const value of set) assert.match(value, /^[A-Za-z0-9_-]{32}$/);
  });
  it('rejects short and control-bearing custom values', () => {
    for (const value of ['', 'short', 'a'.repeat(20) + '\n', 'a'.repeat(1025)])
      assert.throws(() => validatePassword(value), { code: 'E_PASSWORD' });
  });
  it('accepts long passphrases unchanged', () => {
    assert.equal(
      validatePassword('sample long phrase, not a real password'),
      'sample long phrase, not a real password',
    );
  });
});
