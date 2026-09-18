import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import type { Config } from '#core/types';
import { protectHtml, publicHtml, buildViewer } from '#render/viewer';
import { renderMarkdown } from '#render/markdown';
import { createProtector } from '#security/staticrypt';
import { SECURITY_HEADERS } from '#security/policy';

const password = 'exhibit-browser-fixture-password';
const config: Config = {
  schemaVersion: 1,
  storage: {
    provider: 's3',
    bucket: 'exhibit-test',
    region: 'us-east-1',
    prefix: 'exhibit/',
    forcePathStyle: false,
  },
  publicBaseUrl: 'http://127.0.0.1',
  maxInputBytes: 2 * 1024 * 1024,
  brand: { name: 'Exhibit', accent: '#0f766e' },
};
let server: Server;
let origin: string;
let pages: Record<string, string>;
let unexpectedRequests: string[] = [];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Private source title</title></head><body>
<h1>Private Unicode document αβ 🚀</h1><button id="counter">0</button><p id="isolation"></p><p id="network"></p><p id="policy"></p>
<script>
let count=0;document.getElementById('counter').onclick=()=>document.getElementById('counter').textContent=String(++count);
try{window.parent.localStorage.getItem('canary');document.getElementById('isolation').textContent='escaped';}
catch{document.getElementById('isolation').textContent='isolated';}
document.addEventListener('securitypolicyviolation',event=>document.getElementById('policy').textContent=event.violatedDirective);
fetch(new URL('/leak', document.baseURI).href).then(()=>document.getElementById('network').textContent='allowed').catch(()=>document.getElementById('network').textContent='blocked');
</script></body></html>`;

test.beforeAll(async () => {
  const protector = createProtector();
  const payload = await protector.encrypt(html, password);
  const tail = payload.ciphertext.endsWith('a') ? 'b' : 'a';
  const markdown = await readFile(
    new URL('../../examples/artifacts/plan.md', import.meta.url),
    'utf8',
  );
  const rendered = renderMarkdown(
    markdown + '\n\n' + 'longword'.repeat(50),
    'Markdown fixture',
    config,
  );
  pages = {
    '/markdown.html': await protectHtml(rendered.html, password, config, protector),
    '/protected.html': await protectHtml(html, password, config, protector),
    '/public.html': await publicHtml(html, config),
    '/tampered.html': await buildViewer(
      { mode: 'protected', ...payload, ciphertext: payload.ciphertext.slice(0, -1) + tail },
      config,
      await protector.browserSource(),
    ),
  };
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const body = pages[pathname];
    if (!body) {
      if (pathname !== '/favicon.ico') unexpectedRequests.push(pathname);
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test.beforeEach(() => {
  unexpectedRequests = [];
});

test('protected shell contains neither source title, plaintext, nor password', async ({ page }) => {
  const response = await page.goto(`${origin}/protected.html`);
  const source = await response!.text();
  expect(source).not.toContain('Private Unicode document');
  expect(source).not.toContain('Private source title');
  expect(source).not.toContain(password);
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#viewer')).toBeHidden();
});

test('wrong password and tampered ciphertext do not expose content', async ({ page }) => {
  for (const [path, attempt] of [
    ['protected', 'a-wrong-browser-password'],
    ['tampered', password],
  ]) {
    await page.goto(`${origin}/${path}.html`);
    await page.locator('#password').fill(attempt!);
    await page.locator('#unlock').click();
    await expect(page.locator('#status')).toContainText('Unable to unlock');
    await expect(page.locator('#viewer')).toBeHidden();
    await expect(page.locator('#password')).toHaveValue('');
  }
});

test('decrypts locally, preserves inline interaction, and isolates source scripts', async ({
  page,
}) => {
  await page.goto(`${origin}/protected.html`);
  await page.evaluate(() => window.localStorage.setItem('canary', 'not-secret-test-value'));
  await page.locator('#password').fill(password);
  await page.locator('#unlock').click();
  const artifact = page.frameLocator('#viewer');
  await expect(artifact.locator('h1')).toHaveText('Private Unicode document αβ 🚀');
  await artifact.locator('#counter').click();
  await expect(artifact.locator('#counter')).toHaveText('1');
  await expect(artifact.locator('#isolation')).toHaveText('isolated');
  await expect(artifact.locator('#network')).toHaveText('blocked');
  await expect(artifact.locator('#policy')).toHaveText('connect-src');
  expect(unexpectedRequests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual(['canary']);
  expect(await page.evaluate(() => Object.keys(window.sessionStorage))).toEqual([]);
  await expect(page.locator('#password')).toHaveValue('');
});

test('lock discards viewer state and requires the password again', async ({ page }) => {
  await page.goto(`${origin}/protected.html`);
  await page.locator('#password').fill(password);
  await page.locator('#unlock').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await page.locator('#lock').click();
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#password')).toHaveValue('');
  await page.locator('#password').fill(password);
  await page.locator('#unlock').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await page.reload();
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#viewer')).toBeHidden();
});

test('Markdown and the gate fit the viewport and preserve document layout', async ({
  page,
}, testInfo) => {
  await page.goto(`${origin}/markdown.html`);
  await expect(page.locator('#gate')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('gate.png') });
  await page.locator('#password').fill(password);
  await page.locator('#unlock').click();
  const artifact = page.frameLocator('#viewer');
  await expect(artifact.locator('h1')).toBeVisible();
  await expect(artifact.locator('table')).toBeVisible();
  await expect(artifact.locator('pre')).toBeVisible();
  await expect(artifact.locator('input[type="checkbox"]').first()).toBeDisabled();
  expect(
    await artifact
      .locator('html')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('markdown.png') });
});

test('public mode is immediately readable but keeps the same script isolation', async ({
  page,
}) => {
  await page.goto(`${origin}/public.html`);
  await expect(page.frameLocator('#viewer').locator('h1')).toHaveText(
    'Private Unicode document αβ 🚀',
  );
  await expect(page.locator('#mode-label')).toHaveText('Public artifact');
  await expect(page.locator('#lock')).toBeHidden();
  await expect(page.frameLocator('#viewer').locator('#isolation')).toHaveText('isolated');
  await expect(page.frameLocator('#viewer').locator('#network')).toHaveText('blocked');
  await expect(page.frameLocator('#viewer').locator('#policy')).toHaveText('connect-src');
  expect(unexpectedRequests).toEqual([]);
});
