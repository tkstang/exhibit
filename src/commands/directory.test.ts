import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, it, vi } from 'vitest';

import { config } from '#core/fixtures.test-support';
import { deploymentId, scopeDirectory, sha256 } from '#core/identity';
import { createPublicationState } from '#state/store';
import { run } from './run.js';

afterEach(() => vi.unstubAllEnvs());

it('scopes real CLI sessions, SDK requests, and disk receipts to the selected directory', async () => {
  vi.stubEnv('AWS_PROFILE', undefined);
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'exhibit-fixture-access');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'exhibit-fixture-secret');
  vi.stubEnv('AWS_SESSION_TOKEN', 'exhibit-fixture-session');
  const root = await mkdtemp(join(tmpdir(), 'exhibit-directory-'));
  const objects = new Map<string, { body: string; headers: IncomingHttpHeaders; etag: string }>();
  const requests: { method: string; path: string; prefix: string | null }[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    requests.push({
      method: request.method!,
      path: url.pathname,
      prefix: url.searchParams.get('prefix'),
    });
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      const old = objects.get(url.pathname);
      if (url.searchParams.has('list-type')) {
        const prefix = `/${config.storage.bucket}/${url.searchParams.get('prefix') ?? ''}`;
        const contents = [...objects.keys()]
          .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map(
            (key) =>
              `<Contents><Key>${key.slice(config.storage.bucket.length + 2)}</Key></Contents>`,
          )
          .join('');
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(
          `<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
        );
      } else if (
        (request.headers['if-none-match'] === '*' && old) ||
        (request.headers['if-match'] && request.headers['if-match'] !== old?.etag)
      ) {
        response.writeHead(412, { 'content-type': 'application/xml' });
        response.end('<Error><Code>PreconditionFailed</Code></Error>');
      } else if (request.method === 'PUT') {
        const etag = `"${sha256(body)}"`;
        objects.set(url.pathname, { body, headers: request.headers, etag });
        response.writeHead(200, { etag });
        response.end();
      } else if (request.method === 'HEAD' && old) {
        for (const [name, value] of Object.entries(old.headers)) {
          if (
            value !== undefined &&
            (name.startsWith('x-amz-meta-') ||
              ['content-type', 'content-disposition'].includes(name))
          )
            response.setHeader(name, value);
        }
        response.writeHead(200, { etag: old.etag, 'content-length': Buffer.byteLength(old.body) });
        response.end();
      } else if (request.method === 'DELETE') {
        objects.delete(url.pathname);
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(404);
        response.end();
      }
    });
  });
  try {
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
    const configFile = join(root, 'config.json');
    const stateDir = join(root, 'state');
    await writeFile(configFile, JSON.stringify(settings));
    await writeFile(join(root, 'plan.md'), '# Directory fixture\nNon-sensitive sample.');
    const dependencies = {
      cwd: root,
      env: { EXHIBIT_CONFIG: configFile, EXHIBIT_STATE_DIR: stateDir },
    };
    async function invoke(argv: string[]) {
      const result = await run(argv, dependencies);
      assert.equal(result.envelope.ok, true, JSON.stringify(result.envelope));
      assert.ok(result.envelope.ok);
      return result.envelope.data as Record<string, unknown>;
    }
    const passwords = new Map<string, unknown>();
    for (const directory of ['', 'internal/reviews', 'repositories/demo']) {
      const scope = directory ? ['--dir', directory] : [];
      const published = await invoke(['publish', 'plan.md', '--slug', 'plan', ...scope]);
      assert.equal(published.protected, true);
      assert.equal(typeof published.password, 'string');
      passwords.set(directory, published.password);
      assert.equal(
        published.url,
        `${config.publicBaseUrl}/${directory ? `${directory}/` : ''}plan.html`,
      );
      const listed = await invoke(['list', '--show-passwords', ...scope]);
      const artifacts = listed.artifacts as Record<string, unknown>[];
      assert.equal(artifacts.length, 1);
      assert.equal(artifacts[0]?.password, published.password);
    }
    assert.equal(objects.size, 3);
    const internalPath = '/exhibit-test/exhibit/internal/reviews/plan.html';
    const old = objects.get(internalPath)!;
    assert.equal(old.body.includes('Non-sensitive sample.'), false);
    const internalState = createPublicationState(
      scopeDirectory(settings, 'internal/reviews'),
      stateDir,
    );
    const oldDigest = old.headers['x-amz-meta-exhibit-body-sha256'];
    assert.equal(typeof oldDigest, 'string');
    assert.notEqual(
      deploymentId(settings),
      deploymentId(scopeDirectory(settings, 'internal/reviews')),
    );

    const conflict = await run(
      ['publish', 'plan.md', '--slug', 'plan', '--dir', 'internal/reviews'],
      dependencies,
    );
    assert.ok(!conflict.envelope.ok);
    assert.equal(conflict.envelope.error.code, 'E_CONFLICT');
    assert.equal(objects.get(internalPath)?.etag, old.etag);
    const overwritten = await invoke([
      'publish',
      'plan.md',
      '--slug',
      'plan',
      '--dir',
      'internal/reviews/',
      '--overwrite',
    ]);
    assert.notEqual(overwritten.password, passwords.get('internal/reviews'));
    assert.equal(
      (await internalState.read('plan', oldDigest as string))?.password,
      passwords.get('internal/reviews'),
    );
    const currentDigest = objects.get(internalPath)!.headers[
      'x-amz-meta-exhibit-body-sha256'
    ] as string;
    await invoke(['rm', 'plan', '--dir', 'internal/reviews/', '--dry-run']);
    assert.equal(objects.has(internalPath), true);
    await invoke(['rm', 'plan', '--dir', 'internal/reviews/']);
    assert.equal(objects.has(internalPath), false);
    assert.equal(await internalState.read('plan', currentDigest), null);
    assert.equal(
      (await internalState.read('plan', oldDigest as string))?.password,
      passwords.get('internal/reviews'),
    );
    for (const directory of ['', 'repositories/demo']) {
      const listed = await invoke([
        'list',
        '--show-passwords',
        ...(directory ? ['--dir', directory] : []),
      ]);
      const artifacts = listed.artifacts as Record<string, unknown>[];
      assert.equal(artifacts.length, 1);
      assert.equal(artifacts[0]?.password, passwords.get(directory));
    }
    const published = await invoke([
      'publish',
      'plan.md',
      '--slug',
      'no-encrypt',
      '--dir',
      'internal/reviews',
      '--no-encrypt',
    ]);
    assert.equal(published.protected, false);
    assert.equal(published.password, null);
    const uploaded = objects.get('/exhibit-test/exhibit/internal/reviews/no-encrypt.html')!;
    assert.equal(uploaded.headers['x-amz-meta-exhibit-protected'], 'false');
    const payloadText =
      /<script type="application\/json" id="exhibit-payload">([^<]+)<\/script>/.exec(
        uploaded.body,
      )?.[1];
    assert.ok(payloadText);
    const payload = JSON.parse(payloadText) as { mode: string; body: string };
    assert.equal(payload.mode, 'plaintext');
    assert.ok(
      Buffer.from(payload.body, 'base64').toString('utf8').includes('Non-sensitive sample.'),
    );
    const beforeDryRun = requests.length;
    const dryRun = await invoke([
      'publish',
      'plan.md',
      '--slug',
      'preview',
      '--dir',
      'internal/reviews',
      '--no-encrypt',
      '--dry-run',
    ]);
    assert.equal(dryRun.protected, false);
    assert.equal(dryRun.url, `${config.publicBaseUrl}/internal/reviews/preview.html`);
    assert.equal(requests.length, beforeDryRun);
    await writeFile(join(root, 'secret.md'), 'ghp_' + 'x'.repeat(30));
    const blocked = await run(
      ['publish', 'secret.md', '--no-encrypt', '--dir', 'internal'],
      dependencies,
    );
    assert.ok(!blocked.envelope.ok);
    assert.equal(blocked.envelope.error.code, 'E_SECRET_DETECTED');
    assert.equal(requests.length, beforeDryRun);
    assert.ok(requests.some((request) => request.prefix === 'exhibit/internal/reviews/'));
    assert.deepEqual(
      requests.filter((request) => request.method === 'DELETE').map((request) => request.path),
      [internalPath],
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
