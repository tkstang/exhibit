import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, it, vi } from 'vitest';
import { writePrivateJson } from './files.js';

const audit = vi.hoisted(() => ({
  events: [] as string[],
  failure: '',
  deniedPath: '',
  deniedCode: '',
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      if (args[0] === audit.deniedPath)
        throw Object.assign(new Error('fixture'), { code: audit.deniedCode });
      const handle = await actual.open(...args);
      const directory = (await handle.stat()).isDirectory();
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        audit.events.push(directory ? 'directory-sync' : 'file-sync');
        if (directory && audit.failure)
          throw Object.assign(new Error('fixture'), { code: audit.failure });
        return sync();
      };
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      await actual.rename(...args);
      audit.events.push('rename');
    },
    link: async (...args: Parameters<typeof actual.link>) => {
      await actual.link(...args);
      audit.events.push('link');
    },
  };
});
afterEach(() => {
  audit.events.length = 0;
  audit.failure = '';
  audit.deniedPath = '';
  audit.deniedCode = '';
});

it.skipIf(process.platform === 'win32')(
  'permits symlinked ancestors but not a symlinked private directory',
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exhibit-ancestor-'));
    try {
      await mkdir(join(dir, 'real'));
      await symlink(join(dir, 'real'), join(dir, 'alias'));
      const target = join(dir, 'alias', 'private', 'receipt.json');
      await writePrivateJson(target, { fixture: true });
      assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { fixture: true });
      await assert.rejects(writePrivateJson(join(dir, 'alias', 'receipt.json'), {}), {
        code: 'E_STATE',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === 'win32')(
  'tolerates ancestor access limitations, never owned receipt-directory failures',
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exhibit-ancestor-'));
    try {
      const child = join(dir, 'private');
      for (const code of ['EACCES', 'EPERM', 'EROFS']) {
        audit.deniedPath = dir;
        audit.deniedCode = code;
        await writePrivateJson(join(child, 'receipt.json'), {});
        audit.deniedPath = child;
        await assert.rejects(writePrivateJson(join(child, 'receipt.json'), {}), {
          code: 'E_STATE',
        });
      }
      audit.deniedPath = dir;
      audit.deniedCode = 'EIO';
      await assert.rejects(writePrivateJson(join(child, 'receipt.json'), {}), { code: 'E_STATE' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === 'win32')(
  'syncs the parent after rename and create-only link',
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exhibit-durability-'));
    try {
      for (const overwrite of [true, false]) {
        audit.events.length = 0;
        const file = join(dir, String(overwrite));
        await writePrivateJson(file, { fixture: true }, overwrite, false);
        assert.deepEqual(audit.events, [
          'file-sync',
          overwrite ? 'rename' : 'link',
          'directory-sync',
        ]);
        assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { fixture: true });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === 'win32')(
  'ignores unsupported directory sync but fails on real I/O errors',
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exhibit-durability-'));
    try {
      audit.failure = 'EINVAL';
      await writePrivateJson(join(dir, 'unsupported'), {}, true, false);
      audit.failure = 'EIO';
      await assert.rejects(writePrivateJson(join(dir, 'failed'), {}, true, false), {
        code: 'E_STATE',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
