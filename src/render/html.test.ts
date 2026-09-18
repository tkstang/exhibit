import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config } from '#core/fixtures.test-support';
import { renderHtml } from './html.js';
describe('authored HTML', () => {
  it('preserves every authored byte', () => {
    const source =
      '<!doctype html>\n<html><script>window.demo=42;</script><body>Hi α</body></html>';
    assert.equal(renderHtml(source, 'title', config).html, source);
  });
  it('warns about non-inline assets', () => {
    assert.ok(
      renderHtml(
        '<html><script src="https://cdn.example.test/app.js"></script></html>',
        'title',
        config,
      ).warnings.some((w) => w.code === 'W_EXTERNAL_ASSETS'),
    );
  });
  it('rejects empty content', () => {
    assert.throws(() => renderHtml('   ', 'title', config));
  });
});
