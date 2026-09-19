import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'vitest';
import { main } from './cli.js';

function capture() {
  let text = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return { stream, text: () => text };
}

describe('CLI output boundary', () => {
  const originalExitCode = process.exitCode;
  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('emits one JSON error envelope for malformed JSON options', async () => {
    const stdout = capture();
    const stderr = capture();
    await main(['list', '--json=true'], { stdout: stdout.stream, stderr: stderr.stream });
    assert.equal(JSON.parse(stdout.text()).error.code, 'E_USAGE');
    assert.equal(stdout.text().trim().split('\n').length, 1);
    assert.equal(stderr.text(), '');
    assert.equal(process.exitCode, 1);
  });

  it('handles asynchronous broken pipes without leaking raw errors', async () => {
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        setImmediate(() =>
          callback(Object.assign(new Error('secret-output-error'), { code: 'EPIPE' })),
        );
      },
    });
    const stderr = capture();
    await main(['--version', '--json'], { stdout, stderr: stderr.stream });
    assert.equal(process.exitCode, 2);
    assert.match(stderr.text(), /operation may have completed/);
    assert.match(stderr.text(), /passwords not stored locally cannot be recovered/);
    assert.equal(stderr.text().includes('secret-output-error'), false);
    assert.equal(stdout.listenerCount('error'), 0);
  });

  it('handles a failed stderr without recursively throwing', async () => {
    const stdout = capture();
    const stderr = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error('secret-output-error'), { code: 'EPIPE' }));
      },
    });
    await main(['unknown'], { stdout: stdout.stream, stderr });
    assert.equal(process.exitCode, 2);
    assert.equal(stdout.text(), '');
  });

  it('guards the actual entrypoint when its stdout consumer closes', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help', '--json'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.destroy();
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    assert.equal(code, 2);
    assert.match(stderr, /E_UNEXPECTED: Could not deliver command output/);
    assert.equal(stderr.includes('node:events'), false);
    assert.equal(stderr.includes('Error: write EPIPE'), false);
  });
});
