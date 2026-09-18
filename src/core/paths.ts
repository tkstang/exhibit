import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { ExhibitError } from './errors.js';

export function userPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  home = homedir(),
): { configFile: string; stateDir: string } {
  const windows = platform === 'win32';
  const configRoot = windows ? (env.APPDATA ?? join(home, 'AppData', 'Roaming'))
    : (env.XDG_CONFIG_HOME ?? join(home, '.config'));
  const stateRoot = windows ? (env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'))
    : (env.XDG_STATE_HOME ?? join(home, '.local', 'state'));
  if (!isAbsolute(configRoot) || !isAbsolute(stateRoot)) {
    throw new ExhibitError('E_CONFIG', 'Config and state base directories must be absolute.');
  }
  return {
    configFile: resolve(env.EXHIBIT_CONFIG ?? join(configRoot, 'exhibit', 'config.json')),
    stateDir: resolve(env.EXHIBIT_STATE_DIR ?? join(stateRoot, 'exhibit')),
  };
}
