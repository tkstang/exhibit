import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';

export function normalizeReleaseArchive(bytes: Buffer): Buffer {
  assert.ok(bytes.length >= 18, 'Release archive has a truncated gzip header or trailer.');
  assert.equal(bytes[0], 0x1f, 'Release archive is not gzip.');
  assert.equal(bytes[1], 0x8b, 'Release archive is not gzip.');
  assert.equal(bytes[2], 8, 'Release archive must use gzip deflate.');
  // pnpm emits no optional fields. In particular, do not invalidate a header CRC.
  assert.equal(bytes[3], 0, 'Release archive has unsupported gzip header flags.');
  gunzipSync(bytes);
  const normalized = Buffer.from(bytes);
  // RFC 1952 OS=255 is unspecified; preserve the compressed tar and CRC trailer.
  normalized[9] = 255;
  return normalized;
}
