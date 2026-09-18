import { access, chmod, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.bin.exhibit, pkg.bin.xbt, 'Both binaries must use the same entrypoint.');
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
for (const path of [
  '../dist/index.d.ts',
  '../assets/viewer.css',
  '../assets/viewer.js',
  '../assets/staticrypt-license.txt',
])
  await access(new URL(path, import.meta.url));
const result = spawnSync(process.execPath, ['dist/cli.js', '--version', '--json'], {
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr);
const lines = result.stdout.trim().split('\n');
assert.equal(lines.length, 1);
const envelope = JSON.parse(lines[0]);
assert.equal(envelope.ok, true);
assert.equal(envelope.data.version, pkg.version);
process.stdout.write('Build entrypoints and JSON version contract verified.\n');
