import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { scanSecrets } from './secret-scan.js';
describe('best-effort secret guard', () => {
  it('finds tokens without returning matched values', () => {
    const token = 'ghp_' + 'x'.repeat(32);
    const findings = scanSecrets('intro\n' + token);
    assert.deepEqual(findings, [{ rule: 'github-token', line: 2 }]);
    assert.equal(JSON.stringify(findings).includes(token), false);
  });
  it('finds private keys and bearer values', () => {
    assert.equal(scanSecrets('-----BEGIN PRIVATE KEY-----\nBearer ' + 'a'.repeat(30)).length, 2);
  });
  it('does not call ordinary prose a secret', () => {
    assert.equal(
      scanSecrets('Architecture decision: use S3 with private origin access.').length,
      0,
    );
  });
  it('has bounded output and no regex state across calls', () => {
    const text = ('ghp_' + 'a'.repeat(25) + '\n').repeat(100);
    assert.equal(scanSecrets(text).length, 50);
    assert.equal(scanSecrets(text).length, 50);
  });
  it('does not let one token family exhaust every other rule', () => {
    const text = ('ghp_' + 'a'.repeat(25) + '\n').repeat(100) + '-----BEGIN PRIVATE KEY-----';
    const findings = scanSecrets(text);
    assert.equal(findings.length, 50);
    assert.ok(findings.some((finding) => finding.rule === 'private-key'));
  });
});
