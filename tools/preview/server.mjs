import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseConfig } from '../../dist/core/config.js';
import { renderMarkdown } from '../../dist/render/markdown.js';
import { publicHtml, protectHtml } from '../../dist/render/viewer.js';
import { createProtector } from '../../dist/security/staticrypt.js';
import { SECURITY_HEADERS } from '../../dist/security/policy.js';

const config = parseConfig({
  storage: { bucket: 'exhibit-preview', region: 'us-east-1' },
  publicBaseUrl: 'http://localhost:8787',
});
const source = await readFile(new URL('../../examples/artifacts/plan.md', import.meta.url), 'utf8');
const rendered = renderMarkdown(source, 'Example architecture plan', config);
const password = 'exhibit-demo-password'; // Non-sensitive demo fixture, never a production default.
const pages = {
  '/public.html': await publicHtml(rendered.html, config),
  '/protected.html': await protectHtml(rendered.html, password, config, createProtector()),
};
await mkdir('.preview', { recursive: true });
for (const [path, body] of Object.entries(pages)) await writeFile(`.preview${path}`, body);
const server = createServer((req, res) => {
  const page = pages[new URL(req.url ?? '/', 'http://localhost').pathname];
  if (!page) {
    res.writeHead(404);
    res.end('Open /public.html or /protected.html');
    return;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(page);
});
server.listen(8787, '127.0.0.1', () => {
  process.stdout.write(
    'Public: http://localhost:8787/public.html\nProtected: http://localhost:8787/protected.html\nDemo password: exhibit-demo-password\nLocal only; no S3 access. Ctrl-C to stop.\n',
  );
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
