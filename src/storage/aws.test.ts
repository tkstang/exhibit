import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { afterEach, it, vi } from 'vitest';

import { config, object } from '#core/fixtures.test-support';
import { createAwsTransport } from './aws.js';
import { createS3Store } from './s3-store.js';

afterEach(() => vi.unstubAllEnvs());

it('uses an exact-prefix signed listing after HEAD 403 and still creates conditionally', async () => {
  vi.stubEnv('AWS_PROFILE', undefined);
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'exhibit-fixture-access');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'exhibit-fixture-secret');
  vi.stubEnv('AWS_SESSION_TOKEN', 'exhibit-fixture-session');
  const requests: { method: string; url: URL; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method!,
      url: new URL(request.url!, 'http://localhost'),
      headers: request.headers,
    });
    request.resume();
    request.on('end', () => {
      if (request.method === 'HEAD') {
        response.writeHead(403);
        response.end();
      } else if (request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated><KeyCount>0</KeyCount></ListBucketResult>',
        );
      } else {
        response.writeHead(200, { etag: '"created"' });
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const settings = {
    ...config,
    storage: {
      ...config.storage,
      endpoint: `http://127.0.0.1:${address.port}`,
      forcePathStyle: true,
    },
  };
  const aws = createAwsTransport(settings);
  const store = createS3Store(settings, aws.transport);
  try {
    assert.equal(await store.head('fixture'), null);
    await store.put(object());
    assert.deepEqual(
      requests.map((request) => request.method),
      ['HEAD', 'GET', 'PUT'],
    );
    assert.equal(requests[1]?.url.searchParams.get('prefix'), 'exhibit/fixture.html');
    assert.equal(requests[1]?.url.searchParams.get('max-keys'), '1');
    assert.equal(requests[2]?.headers['if-none-match'], '*');
    assert.ok(
      requests.every((request) => request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ')),
    );
  } finally {
    aws.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('serializes conditional writes and deletes through the pinned SDK over HTTP', async () => {
  // Fixture credentials keep the real SDK off the machine credential chain.
  vi.stubEnv('AWS_PROFILE', undefined);
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'exhibit-fixture-access');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'exhibit-fixture-secret');
  vi.stubEnv('AWS_SESSION_TOKEN', 'exhibit-fixture-session');
  const requests: { method: string; path: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method!, path: request.url!, headers: request.headers });
    request.resume();
    request.on('end', () => {
      if (request.headers['if-match'] === '"stale"') {
        response.writeHead(412, { 'content-type': 'application/xml' });
        response.end('<Error><Code>PreconditionFailed</Code></Error>');
      } else {
        response.writeHead(request.method === 'DELETE' ? 204 : 200, { etag: '"current"' });
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const settings = {
    ...config,
    storage: {
      ...config.storage,
      endpoint: `http://127.0.0.1:${address.port}`,
      forcePathStyle: true,
    },
  };
  const aws = createAwsTransport(settings);
  const store = createS3Store(settings, aws.transport);
  try {
    await store.put(object());
    await store.put({ ...object(), expectedEtag: '"current"' });
    await assert.rejects(store.put({ ...object(), expectedEtag: '"stale"' }), {
      code: 'E_CONFLICT',
    });
    await assert.rejects(store.remove('fixture', '"stale"'), { code: 'E_CONFLICT' });
    await store.remove('fixture', '"current"');
    assert.deepEqual(
      requests.map(({ method }) => method),
      ['PUT', 'PUT', 'PUT', 'DELETE', 'DELETE'],
    );
    assert.equal(requests[0]!.headers['if-none-match'], '*');
    assert.deepEqual(
      requests.slice(1).map(({ headers }) => headers['if-match']),
      ['"current"', '"stale"', '"stale"', '"current"'],
    );
    for (const request of requests) {
      assert.equal(
        new URL(request.path, settings.storage.endpoint).pathname,
        '/exhibit-test/exhibit/fixture.html',
      );
      assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /);
    }
    assert.equal(requests[0]!.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(requests[0]!.headers['x-amz-meta-exhibit-format'], '1');
    assert.equal(requests[0]!.headers['x-amz-meta-password'], undefined);
  } finally {
    aws.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
