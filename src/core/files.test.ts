import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { readTextFile, writePrivateJson, ensurePrivateDirectory } from './files.js';

async function temporary(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'exhibit-files-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
describe('bounded private file I/O', () => {
  it('round-trips UTF-8 and exact size boundary', () => temporary(async (dir) => {
    const file = join(dir,'file.md'); await writeFile(file,'hello'); assert.equal(await readTextFile(file,5),'hello');
  }));
  it('rejects oversize input', () => temporary(async (dir) => { const file=join(dir,'a'); await writeFile(file,'123456'); await assert.rejects(readTextFile(file,5), { code:'E_INPUT_SIZE' }); }));
  it('rejects invalid UTF-8', () => temporary(async (dir) => { const file=join(dir,'a'); await writeFile(file,Buffer.from([255,255])); await assert.rejects(readTextFile(file,9), { code:'E_INPUT_ENCODING' }); }));
  it('rejects symlinked input', () => temporary(async (dir) => { await writeFile(join(dir,'a'),'private'); await symlink(join(dir,'a'),join(dir,'b')); await assert.rejects(readTextFile(join(dir,'b'),99), { code:'E_INPUT' }); }));
  it('rejects directory input', () => temporary(async (dir) => { await assert.rejects(readTextFile(dir,99), { code:'E_INPUT' }); }));
  it('writes mode 0600 files', () => temporary(async (dir) => {
    const file=join(dir,'receipt.json'); await writePrivateJson(file,{ hello:'world' });
    assert.deepEqual(JSON.parse(await readTextFile(file,1000)),{ hello:'world' });
    if(process.platform!=='win32') assert.equal((await stat(file)).mode & 0o777,0o600);
  }));
  it('init writes never replace existing config without force', () => temporary(async (dir) => {
    const file=join(dir,'config.json'); await writePrivateJson(file,{ a:1 },false); await assert.rejects(writePrivateJson(file,{ a:2 },false),{ code:'E_CONFIG_EXISTS' });
    assert.equal(JSON.parse(await readTextFile(file,1000)).a,1);
  }));
  it('does not chmod a shared directory to private', () => temporary(async (dir) => {
    if(process.platform==='win32') return;
    const shared=join(dir,'shared'); await mkdir(shared,{ mode:0o755 }); await assert.rejects(ensurePrivateDirectory(shared),{ code:'E_STATE' }); assert.equal((await stat(shared)).mode & 0o777,0o755);
  }));
});
