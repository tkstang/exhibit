import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { ExhibitError, hasCode } from './errors.js';

/** Bound reads even when a file grows after stat. Refuse special files and final symlinks. */
export async function readTextFile(path: string, maximum: number): Promise<string> {
  let handle;
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new ExhibitError('E_INPUT', 'Expected a regular, non-symlink file.');
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile()) throw new ExhibitError('E_INPUT', 'Expected a regular file.');
    if (stat.size > maximum)
      throw new ExhibitError('E_INPUT_SIZE', 'Input exceeds the configured size limit.');
    const bytes = Buffer.alloc(maximum + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await handle.read(bytes, total, bytes.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > maximum)
      throw new ExhibitError('E_INPUT_SIZE', 'Input exceeds the configured size limit.');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total));
    } catch {
      throw new ExhibitError('E_INPUT_ENCODING', 'Input must be valid UTF-8 text.');
    }
  } catch (error) {
    if (error instanceof ExhibitError) throw error;
    throw new ExhibitError('E_INPUT', 'Unable to read the requested file.', {
      hint: 'Check that the path is a readable regular file, not a symlink or device.',
    });
  } finally {
    await handle?.close();
  }
}

/** Inspect only; callers may handle ENOENT without creating state during reads. */
export async function assertPrivateDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
  ) {
    throw new ExhibitError(
      'E_STATE',
      'Local state requires owned, private, non-symlink directories.',
    );
  }
}

export async function ensurePrivateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
    await assertPrivateDirectory(path);
  } catch {
    throw new ExhibitError('E_STATE', 'Cannot create a private local directory.', {
      hint: 'Use an owned, non-symlink directory. Check EXHIBIT_STATE_DIR and EXHIBIT_CONFIG.',
    });
  }
}

/** Temp file lives beside its target: rename is atomic on the same filesystem. */
export async function writePrivateJson(
  path: string,
  value: unknown,
  overwrite = true,
  privateDirectory = true,
): Promise<void> {
  if (privateDirectory) await ensurePrivateDirectory(dirname(path));
  else {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const parent = await lstat(dirname(path));
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw new ExhibitError('E_CONFIG', 'Unsafe config directory.');
  }
  const temporary = join(dirname(path), `.exhibit-${randomBytes(16).toString('hex')}.tmp`);
  let handle;
  try {
    try {
      const old = await lstat(path);
      if (!old.isFile() || old.isSymbolicLink())
        throw new ExhibitError('E_STATE', 'Refusing an unsafe state/config target.');
      if (!overwrite)
        throw new ExhibitError('E_CONFIG_EXISTS', 'Configuration already exists.', {
          hint: 'Choose another --config path or explicitly pass --force.',
        });
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(
      `${JSON.stringify(value, null, 2)}
`,
      'utf8',
    );
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (!overwrite) {
      // link is create-only and atomic; unlike rename it cannot clobber a concurrent init.
      const { link } = await import('node:fs/promises');
      try {
        await link(temporary, path);
      } catch (error) {
        if (hasCode(error, 'EEXIST'))
          throw new ExhibitError('E_CONFIG_EXISTS', 'Configuration already exists.');
        throw error;
      }
      await unlink(temporary);
    } else {
      await rename(temporary, path);
    }
  } catch (error) {
    if (error instanceof ExhibitError) throw error;
    throw new ExhibitError(
      'E_STATE',
      'Could not persist local configuration or publication state.',
      {
        hint: 'Check directory ownership and free space. Publication output may contain your only copy of the password.',
      },
    );
  } finally {
    await handle?.close();
    await unlink(temporary).catch(() => undefined);
  }
}
