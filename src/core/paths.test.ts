import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { userPaths } from './paths.js';
describe('per-user paths', () => {
  it('uses XDG roots', () => {
    const p = userPaths({ XDG_CONFIG_HOME: '/a', XDG_STATE_HOME: '/b' }, 'linux', '/home/test');
    assert.equal(p.configFile, '/a/exhibit/config.json');
    assert.equal(p.stateDir, '/b/exhibit');
  });
  it('rejects relative XDG bases', () => {
    assert.throws(() => userPaths({ XDG_CONFIG_HOME: 'relative' }, 'linux', '/home/test'), {
      code: 'E_CONFIG',
    });
  });
  it('honors explicit paths', () => {
    const p = userPaths(
      { EXHIBIT_CONFIG: '/custom/config.json', EXHIBIT_STATE_DIR: '/custom/state' },
      'linux',
      '/home/test',
    );
    assert.equal(p.configFile, '/custom/config.json');
    assert.equal(p.stateDir, '/custom/state');
  });
});
