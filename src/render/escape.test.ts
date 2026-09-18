import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { escapeHtml, scriptJson, isSafeLink } from './escape.js';
describe('document boundaries', () => {
  it('escapes HTML including quotes', () => {
    assert.equal(escapeHtml('<script a="x">&'), '&lt;script a=&quot;x&quot;&gt;&amp;');
  });
  it('cannot close a JSON script element', () => {
    const source = { text: '</script><script>bad()</script> & \u2028' };
    const json = scriptJson(source);
    assert.equal(json.includes('<'), false);
    assert.deepEqual(JSON.parse(json), source);
  });
  it('only permits explicit web/email/fragment links', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,hi',
      '//evil.test',
      '../secret',
      'file:///etc/passwd',
      'java\nscript:x',
    ])
      assert.equal(isSafeLink(href), false);
    for (const href of ['https://example.test', 'mailto:team@example.test', '#section'])
      assert.equal(isSafeLink(href), true);
  });
});
