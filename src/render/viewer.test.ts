import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'vitest';
import { config } from '#core/fixtures.test-support';
import { createProtector } from '#security/staticrypt';
import { protectHtml, plaintextHtml } from './viewer.js';

interface LocationUpdate {
  readonly search?: string;
  readonly hash?: string;
}
interface LocationContract {
  windowName(location: { search: string; hash: string }): string;
  message(location: { search: string; hash: string }): Record<string, unknown>;
  readUpdate(event: { source: unknown; data: unknown }, source: unknown): LocationUpdate | null;
  nextUrl(href: string, update: LocationUpdate): string;
}

// Evaluate the shipped browser asset as-is; ExhibitViewer is defined but not started.
async function locationContract(): Promise<LocationContract> {
  const source = await readFile(new URL('../../assets/viewer.js', import.meta.url), 'utf8');
  const window: { ExhibitLocation?: LocationContract } = {};
  runInNewContext(source, { window, URL });
  assert.ok(window.ExhibitLocation);
  return window.ExhibitLocation;
}

describe('viewer location contract', () => {
  const frame = { name: 'frame window' };
  const valid = { type: 'exhibit-location', v: 1, search: '?theme=light', hash: '#9' };

  it('encodes the outer search and hash into the frame name', async () => {
    const contract = await locationContract();
    const name = contract.windowName({ search: '?theme=light', hash: '#9' });
    assert.ok(name.startsWith('exhibit-location:'));
    assert.deepEqual(JSON.parse(name.slice('exhibit-location:'.length)), {
      v: 1,
      search: '?theme=light',
      hash: '#9',
    });
    assert.deepEqual(JSON.parse(contract.windowName({ search: '', hash: '' }).slice(17)), {
      v: 1,
      search: '',
      hash: '',
    });
  });

  it('replaces only an over-length value with an empty string', async () => {
    const contract = await locationContract();
    const atLimit = { search: '?' + 'a'.repeat(2047), hash: '#' + 'b'.repeat(2048) };
    const expected = { v: 1, search: atLimit.search, hash: '' };
    assert.deepEqual(JSON.parse(contract.windowName(atLimit).slice(17)), expected);
    assert.deepEqual({ ...contract.message(atLimit) }, { type: 'exhibit-location', ...expected });
  });

  it('accepts complete and partial updates from the frame window', async () => {
    const contract = await locationContract();
    // Results come from another realm; copy them so strict equality compares shape only.
    const accept = (data: unknown) => {
      const update = contract.readUpdate({ source: frame, data }, frame);
      return update && { ...update };
    };
    assert.deepEqual(accept(valid), { search: '?theme=light', hash: '#9' });
    assert.deepEqual(accept({ type: 'exhibit-location', v: 1 }), {});
    assert.deepEqual(accept({ type: 'exhibit-location', v: 1, hash: '', extra: 1 }), { hash: '' });
    assert.deepEqual(accept({ type: 'exhibit-location', v: 1, search: undefined, hash: '#' }), {
      hash: '#',
    });
    assert.deepEqual(accept({ ...valid, search: '?' + 'q'.repeat(2047) }), {
      search: '?' + 'q'.repeat(2047),
      hash: '#9',
    });
    assert.deepEqual(accept(Object.assign(Object.create(null), valid)), {
      search: '?theme=light',
      hash: '#9',
    });
  });

  it('rejects messages from any other source', async () => {
    const contract = await locationContract();
    for (const source of [null, undefined, {}, { name: 'frame window' }])
      assert.equal(contract.readUpdate({ source, data: valid }, frame), null);
    assert.equal(contract.readUpdate({ source: frame, data: valid }, null), null);
  });

  it('rejects malformed shapes, versions, and values', async () => {
    const contract = await locationContract();
    class Message {
      type = 'exhibit-location';
      v = 1;
    }
    for (const data of [
      null,
      'exhibit-location',
      [valid],
      new Message(),
      { ...valid, type: 'location' },
      { ...valid, v: 2 },
      { ...valid, v: '1' },
      { type: 'exhibit-location' },
      { ...valid, search: 'theme=light' },
      { ...valid, search: '#9' },
      { ...valid, hash: '9' },
      { ...valid, hash: '?9' },
      { ...valid, search: null },
      { ...valid, hash: 9 },
      { ...valid, search: '?a\nb' },
      { ...valid, hash: '#a\u0000' },
      { ...valid, hash: '#\u007f' },
      { ...valid, search: '?\u0085' },
      { ...valid, search: '?' + 'a'.repeat(2048) },
      { ...valid, hash: '#' + 'a'.repeat(2048) },
    ])
      assert.equal(contract.readUpdate({ source: frame, data }, frame), null, JSON.stringify(data));
  });

  it('changes only the query and hash of the current URL', async () => {
    const contract = await locationContract();
    const href = 'https://exhibit.test/a/b.html?old=1#old';
    assert.equal(
      contract.nextUrl(href, { search: '?theme=light', hash: '#9' }),
      'https://exhibit.test/a/b.html?theme=light#9',
    );
    assert.equal(contract.nextUrl(href, { hash: '#9' }), 'https://exhibit.test/a/b.html?old=1#9');
    assert.equal(contract.nextUrl(href, { search: '' }), 'https://exhibit.test/a/b.html#old');
    assert.equal(contract.nextUrl(href, {}), href);
    // A literal '#' in the query is encoded, never reinterpreted as a new fragment.
    assert.equal(
      contract.nextUrl(href, { search: '?a#b' }),
      'https://exhibit.test/a/b.html?a%23b#old',
    );
    // A protocol-relative-looking path cannot redirect the update to another origin.
    assert.equal(
      contract.nextUrl('https://exhibit.test//evil.test/x', { search: '?q' }),
      'https://exhibit.test//evil.test/x?q',
    );
  });
});
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
    const html = await plaintextHtml('<h1>hello</h1>', config);
    assert.ok(html.includes('sandbox="allow-scripts'));
    assert.equal(html.includes('allow-same-origin'), false);
    assert.equal(html.includes('localStorage.setItem'), false);
  });
  it('does not allow plaintext HTML to break the wrapper script', async () => {
    const html = await plaintextHtml('</script><script>window.evil=true</script>', config);
    assert.equal(html.includes('<script>window.evil=true'), false);
  });
});
