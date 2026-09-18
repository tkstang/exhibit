import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseCli, wantsJson } from './parse.js';
describe('CLI parsing', () => {
  it('supports alias rm and global flags', () => {
    const r = parseCli(['--json', 'rm', 'plan']);
    assert.equal(r.command, 'remove');
    assert.equal(r.json, true);
  });
  it('supports leading-dash filenames after --', () => {
    assert.equal(parseCli(['publish', '--', '--json']).positionals[0], '--json');
    assert.equal(wantsJson(['publish', '--', '--json']), false);
  });
  it('rejects inappropriate flags', () => {
    assert.throws(() => parseCli(['list', '--public']), { code: 'E_USAGE' });
    for (const argv of [
      ['list', '--no-encrypt'],
      ['doctor', '--dir', 'internal'],
      ['init', '--dir', 'internal'],
    ])
      assert.throws(() => parseCli(argv), { code: 'E_USAGE' });
  });
  it('accepts directory scope for artifact commands and both plaintext flag names', () => {
    for (const argv of [['publish', 'plan.md'], ['list'], ['remove', 'plan'], ['rm', 'plan']]) {
      assert.equal(parseCli([...argv, '--dir=internal/reviews']).text('dir'), 'internal/reviews');
    }
    for (const flag of ['no-encrypt', 'public'] as const)
      assert.equal(parseCli(['publish', 'plan.md', `--${flag}`]).flag(flag), true);
  });
  it('rejects extra/missing positional arguments', () => {
    for (const argv of [['publish'], ['list', 'extra'], ['remove', 'a', 'b']])
      assert.throws(() => parseCli(argv), { code: 'E_USAGE' });
  });
  it('does not leak unknown option values', () => {
    try {
      parseCli(['--unknown-secret-value']);
      assert.fail('must throw');
    } catch (error) {
      assert.equal(String(error).includes('unknown-secret-value'), false);
    }
  });
  it('keeps help and version simple', () => {
    assert.equal(parseCli([]).command, 'help');
    assert.equal(parseCli(['publish', '--help']).command, 'help');
    assert.equal(parseCli(['--version', '--json']).command, 'version');
  });
});
