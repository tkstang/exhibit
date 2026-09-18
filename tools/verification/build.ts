import { access, chmod, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const pkg: unknown = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
assert.ok(typeof pkg === 'object' && pkg !== null && 'bin' in pkg && 'version' in pkg);
assert.ok(
  typeof pkg.bin === 'object' && pkg.bin !== null && 'exhibit' in pkg.bin && 'xbt' in pkg.bin,
);
assert.equal(pkg.bin.exhibit, pkg.bin.xbt, 'Both binaries must use the same entrypoint.');
await chmod(new URL('../../dist/cli.js', import.meta.url), 0o755);
for (const path of [
  '../../dist/index.d.ts',
  '../../assets/viewer.css',
  '../../assets/viewer.js',
  '../../assets/staticrypt-license.txt',
])
  await access(new URL(path, import.meta.url));
const result = spawnSync(process.execPath, ['dist/cli.js', '--version', '--json'], {
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr);
const lines = result.stdout.trim().split('\n');
assert.equal(lines.length, 1);
assert.ok(lines[0] !== undefined);
const envelope: unknown = JSON.parse(lines[0]);
assert.ok(
  typeof envelope === 'object' && envelope !== null && 'ok' in envelope && 'data' in envelope,
);
assert.ok(
  typeof envelope.data === 'object' && envelope.data !== null && 'version' in envelope.data,
);
assert.equal(envelope.ok, true);
assert.equal(envelope.data.version, pkg.version);
process.stdout.write('Build entrypoints and JSON version contract verified.\n');
