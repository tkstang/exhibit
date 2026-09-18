import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config } from '#core/fixtures.test-support';
import { createProtector } from '#security/staticrypt';
import { protectHtml, publicHtml } from './viewer.js';
describe('artifact viewer', () => {
  it('hides plaintext and title outside the gate', async () => {
    const html = await protectHtml(
      '<h1>confidential sentinel</h1>',
      'fixture-long-password',
      config,
      createProtector(),
    );
    assert.equal(html.includes('confidential sentinel'), false);
    assert.equal(html.includes('fixture-long-password'), false);
    assert.ok(html.includes('Protected exhibit'));
  });
  it('uses an opaque-origin iframe without remember-me', async () => {
    const html = await publicHtml('<h1>hello</h1>', config);
    assert.ok(html.includes('sandbox="allow-scripts'));
    assert.equal(html.includes('allow-same-origin'), false);
    assert.equal(html.includes('localStorage.setItem'), false);
  });
  it('does not allow public HTML to break the wrapper script', async () => {
    const html = await publicHtml('</script><script>window.evil=true</script>', config);
    assert.equal(html.includes('<script>window.evil=true'), false);
  });
});
