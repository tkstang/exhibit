import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config } from '#core/fixtures.test-support';
import { renderMarkdown } from './markdown.js';
describe('GFM presentation', () => {
  it('renders tables, tasks, strikethrough and fenced code', () => {
    const r = renderMarkdown(
      '# Plan\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] Done\n\n~~old~~\n\n```ts\nconst n = 1;\n```',
      'Plan',
      config,
    );
    for (const tag of ['<table>', 'checkbox', '<del>', '<pre>', '<h1'])
      assert.ok(r.html.includes(tag));
  });
  it('does not execute raw HTML in Markdown', () => {
    const r = renderMarkdown('<script>alert(1)</script>', 'Plan', config);
    assert.equal(r.html.includes('<script>'), false);
    assert.ok(r.html.includes('&lt;script&gt;'));
  });
  it('escapes malicious titles and branding', () => {
    const r = renderMarkdown('# hi', '</title><script>bad()</script>', {
      ...config,
      brand: { ...config.brand, name: '<img onerror=x>' },
    });
    assert.equal(r.html.includes('<script>bad'), false);
    assert.equal(r.html.includes('<img onerror'), false);
  });
  it('removes dangerous links and external images', () => {
    const r = renderMarkdown(
      '[bad](javascript:alert%281%29)\n\n![diagram](https://remote.test/private.png)',
      'Plan',
      config,
    );
    assert.equal(r.html.includes('href="javascript:'), false);
    assert.equal(r.html.includes('<img'), false);
    assert.ok(r.warnings.some((w) => w.code === 'W_IMAGE_OMITTED'));
  });
  it('creates distinct heading anchors', () => {
    const r = renderMarkdown('# Plan\n\n## Same\n\n## Same', 'Plan', config);
    assert.ok(r.html.includes('id="same"'));
    assert.ok(r.html.includes('id="same-1"'));
  });
});
