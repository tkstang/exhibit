import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import type { Config } from '#core/types';
import { protectHtml, publicHtml, buildViewer } from '#render/viewer';
import { renderMarkdown } from '#render/markdown';
import { createProtector } from '#security/staticrypt';
import {
  CONTENT_SECURITY_POLICY,
  META_CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
} from '#security/policy';

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
    '/embed-header.html': '<!doctype html><iframe id="hosted" src="/protected.html"></iframe>',
    '/embed-meta.html':
      '<!doctype html><iframe id="hosted" src="/meta-only/protected.html"></iframe>',
    '/tampered.html': await buildViewer(
      { mode: 'protected', ...payload, ciphertext: payload.ciphertext.slice(0, -1) + tail },
      config,
      await protector.browserSource(),
    ),
  };
  const fragmentMarkdown = renderMarkdown(
    '# Fragment fixture\n\n[Jump to target](#caf%C3%A9)\n\n' +
      'Filler paragraph.\n\n'.repeat(80) +
      '## Café\n\n[Missing target](#missing)\n\n[Malformed fragment](#bad%ZZ)\n\n[Back to top](#)',
    'Fragment fixture',
    config,
  ).html;
  const fragmentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Fragment fixture</title></head><body>
<h1>Fragment fixture</h1><a href="#caf%C3%A9"><span>Jump to target</span></a>
<a href="#document-panel">Document panel</a><section id="document-panel" hidden>Document panel content</section>
<a href="#window-panel">Window panel</a><section id="window-panel" hidden>Window panel content</section>
<a href="#window-ready-panel">Window ready panel</a><section id="window-ready-panel" hidden>Window ready panel content</section>
<script>
function panelHandler(id) {
  return (event) => {
    if (event.defaultPrevented || event.target.closest('a')?.getAttribute('href') !== '#' + id) return;
    event.preventDefault();
    const panel = document.getElementById(id);
    panel.hidden = !panel.hidden;
  };
}
document.addEventListener('DOMContentLoaded', () => document.addEventListener('click', panelHandler('document-panel')));
window.addEventListener('click', panelHandler('window-panel'));
window.addEventListener('DOMContentLoaded', () => window.addEventListener('click', panelHandler('window-ready-panel')));
for (const capture of [true, false]) {
  window.addEventListener('click', (event) => {
    if (document.body.dataset.windowStop !== String(capture)) return;
    document.body.dataset.beforeCancel = String(event.defaultPrevented);
    event.stopPropagation();
    if (document.body.dataset.windowCancel === 'true') event.preventDefault();
  }, capture);
  window.addEventListener('click', (event) => {
    if (document.body.dataset.windowStop !== String(capture)) return;
    document.body.dataset.afterCancel = String(event.defaultPrevented);
  }, capture);
}
</script>
<div style="height:3000px"></div><h2 id="café">Café</h2>
<a href="#missing">Missing target</a><a href="#bad%ZZ">Malformed fragment</a><a href="#">Back to top</a>
<a href="#legacy">Named target</a><div style="height:1500px"></div><a name="legacy">Legacy anchor</a>
<button id="counter">0</button><script>document.getElementById('counter').onclick = (event) => event.target.textContent = String(Number(event.target.textContent) + 1);</script>
</body></html>`;
  for (const [format, source] of [
    ['markdown', fragmentMarkdown],
    ['html', fragmentHtml],
  ] as const) {
    pages[`/fragments-${format}-protected.html`] = await protectHtml(
      source,
      password,
      config,
      protector,
    );
    pages[`/fragments-${format}-public.html`] = await publicHtml(source, config);
  }
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const metaOnly = pathname.startsWith('/meta-only/');
    const body = pages[metaOnly ? pathname.slice('/meta-only'.length) : pathname];
    if (!body) {
      if (pathname !== '/favicon.ico') unexpectedRequests.push(pathname);
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      ...(metaOnly ? {} : SECURITY_HEADERS),
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

for (const delivery of ['headers', 'meta-only']) {
  const prefix = delivery === 'meta-only' ? '/meta-only' : '';
  for (const mode of ['protected', 'public']) {
    test(`authored delegated panels take precedence with ${mode} ${delivery}`, async ({ page }) => {
      await page.goto(`${origin}${prefix}/fragments-html-${mode}.html`);
      if (mode === 'protected') {
        await page.locator('#password').fill(password);
        await page.locator('#unlock').click();
      }
      const artifact = page.frameLocator('#viewer');
      for (const [name, id] of [
        ['Document panel', 'document-panel'],
        ['Window panel', 'window-panel'],
        ['Window ready panel', 'window-ready-panel'],
      ] as const) {
        const link = artifact.getByRole('link', { name, exact: true });
        await link.click();
        await expect(artifact.locator(`#${id}`)).toBeVisible();
        await link.click();
        await expect(artifact.locator(`#${id}`)).toBeHidden();
      }
      await artifact.getByRole('link', { name: 'Jump to target' }).click();
      await expect(artifact.locator('h2')).toBeInViewport();
      expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
      expect(unexpectedRequests).toEqual([]);
    });
    test(`fragment URL whitespace is normalized with ${mode} ${delivery}`, async ({ page }) => {
      await page.goto(`${origin}${prefix}/fragments-html-${mode}.html`);
      if (mode === 'protected') {
        await page.locator('#password').fill(password);
        await page.locator('#unlock').click();
      }
      const artifact = page.frameLocator('#viewer');
      const link = artifact.getByRole('link', { name: 'Jump to target' });
      await expect(link).toBeVisible();
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      for (const href of [
        ' #caf%C3%A9 ',
        '\t#ca\tf%\rC3%\nA9\r\n',
        String.fromCharCode(...Array.from({ length: 33 }, (_, index) => index)) +
          '#caf%C3%A9' +
          String.fromCharCode(...Array.from({ length: 33 }, (_, index) => 32 - index)),
      ]) {
        await link.evaluate((element, value) => element.setAttribute('href', value), href);
        await link.click();
        await expect(artifact.locator('h2')).toBeInViewport();
        expect(await artifact.locator('html').evaluate(() => window.scrollY)).toBeGreaterThan(1000);
        await artifact.getByRole('link', { name: 'Back to top' }).click();
        await expect.poll(() => artifact.locator('html').evaluate(() => window.scrollY)).toBe(0);
      }
      expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
      expect(requests).toEqual([]);
      expect(unexpectedRequests).toEqual([]);
    });
    test(`fragment guards survive stopped propagation with ${mode} ${delivery}`, async ({
      page,
    }) => {
      await page.goto(`${origin}${prefix}/fragments-html-${mode}.html`);
      if (mode === 'protected') {
        await page.locator('#password').fill(password);
        await page.locator('#unlock').click();
      }
      const artifact = page.frameLocator('#viewer');
      const link = artifact.getByRole('link', { name: 'Jump to target' });
      await expect(link).toBeVisible();
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      for (const [node, capture] of [
        ['link', false],
        ['body', false],
        ['body', true],
        ['document', false],
        ['document', true],
        ['window', false],
        ['window', true],
      ] as const) {
        for (const cancel of [false, true]) {
          await link.evaluate(
            (element, options) => {
              if (options.node === 'window') {
                document.body.dataset.windowStop = String(options.capture);
                document.body.dataset.windowCancel = String(options.cancel);
                return;
              }
              const target =
                options.node === 'link'
                  ? element
                  : options.node === 'body'
                    ? document.body
                    : document;
              target.addEventListener(
                'click',
                (event) => {
                  document.body.dataset.beforeCancel = String(event.defaultPrevented);
                  event.stopPropagation();
                  if (options.cancel) event.preventDefault();
                },
                { capture: options.capture, once: true },
              );
              target.addEventListener(
                'click',
                (event) => {
                  document.body.dataset.afterCancel = String(event.defaultPrevented);
                },
                { capture: options.capture, once: true },
              );
            },
            { node, capture, cancel },
          );
          await link.focus();
          await page.keyboard.press('Enter');
          await expect(artifact.locator('body')).toHaveAttribute('data-before-cancel', 'false');
          await expect(artifact.locator('body')).toHaveAttribute(
            'data-after-cancel',
            String(cancel),
          );
          if (cancel) {
            await expect(link).toBeFocused();
            expect(await artifact.locator('html').evaluate(() => window.scrollY)).toBe(0);
          } else {
            await expect(artifact.locator('h2')).toBeFocused();
            await expect(artifact.locator('h2')).toBeInViewport();
          }
          await artifact.locator('body').evaluate((body) => {
            delete body.dataset.windowStop;
            delete body.dataset.windowCancel;
          });
          await artifact.getByRole('link', { name: 'Back to top' }).click();
          await expect.poll(() => artifact.locator('html').evaluate(() => window.scrollY)).toBe(0);
        }
      }
      expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
      expect(requests).toEqual([]);
    });
    test(`fragment links support open shadows and SVG with ${mode} ${delivery}`, async ({
      page,
    }) => {
      await page.goto(`${origin}${prefix}/fragments-html-${mode}.html`);
      if (mode === 'protected') {
        await page.locator('#password').fill(password);
        await page.locator('#unlock').click();
      }
      const artifact = page.frameLocator('#viewer');
      await expect(artifact.locator('h1')).toHaveText('Fragment fixture');
      await artifact.locator('body').evaluate((body) => {
        const host = document.createElement('div');
        host.id = 'shadow-host';
        body.prepend(host);
        host.attachShadow({ mode: 'open' }).innerHTML = `
          <a href="#shadow-destination"><span>Shadow fragment</span></a>
          <a href="#caf%C3%A9">Shadow document fragment</a>
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="40">
            <a xlink:href="#shadow-destination"><text x="0" y="25">Shadow SVG fragment</text></a>
          </svg>
          <div style="height:1500px"></div><p id="shadow-destination">Shadow target</p>`;
        body.insertAdjacentHTML(
          'afterbegin',
          `
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="80">
            <a href="#caf%C3%A9"><text x="0" y="25">SVG href fragment</text></a>
            <a xlink:href="#caf%C3%A9"><text x="0" y="65">SVG xlink fragment</text></a>
          </svg>
          <p id="shadow-destination">Document target with same ID</p>`,
        );
      });
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      for (const label of ['SVG href fragment', 'SVG xlink fragment', 'Shadow document fragment']) {
        await artifact.getByText(label, { exact: true }).click();
        await expect(artifact.locator('h2')).toBeInViewport();
        await expect(artifact.locator('h2')).toBeFocused();
      }
      for (const label of ['Shadow fragment', 'Shadow SVG fragment']) {
        await artifact.getByText(label, { exact: true }).click();
        const destination = artifact.locator('#shadow-host').locator('#shadow-destination');
        await expect(destination).toBeInViewport();
        await expect(destination).toBeFocused();
      }
      await artifact.getByText('Shadow fragment', { exact: true }).evaluate((element) => {
        element.addEventListener('click', (event) => event.stopPropagation());
      });
      await artifact.getByText('Shadow fragment', { exact: true }).click();
      await expect(artifact.locator('#shadow-host').locator('#shadow-destination')).toBeFocused();
      expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
      expect(requests).toEqual([]);
    });
    test(`fragment IDs prefer literal matches and move keyboard focus with ${mode} ${delivery}`, async ({
      page,
    }) => {
      await page.goto(`${origin}${prefix}/fragments-html-${mode}.html`);
      if (mode === 'protected') {
        await page.locator('#password').fill(password);
        await page.locator('#unlock').click();
      }
      const artifact = page.frameLocator('#viewer');
      await expect(artifact.locator('h1')).toHaveText('Fragment fixture');
      await artifact.locator('body').evaluate((body) => {
        body.insertAdjacentHTML(
          'beforeend',
          `
          <p id="100%25">Literal percent target</p><p id="100%">Decoded percent target</p>
          <p id="bad%ZZ">Malformed literal target</p><p id="authored-tabindex" tabindex="0">Focusable target</p>
          <button id="after-target">Next control</button>`,
        );
      });
      const link = artifact.getByRole('link', { name: 'Jump to target' });
      const historyLength = await artifact.locator('html').evaluate(() => history.length);
      for (const [href, id] of [
        ['#100%25', '100%25'],
        ['#100%2525', '100%25'],
        ['#bad%ZZ', 'bad%ZZ'],
        ['#caf%C3%A9', 'café'],
        ['#legacy', null],
        ['#authored-tabindex', 'authored-tabindex'],
      ] as const) {
        await link.evaluate((element, value) => element.setAttribute('href', value), href);
        await link.focus();
        await page.keyboard.press('Enter');
        const destination = id
          ? artifact.locator(`[id="${id}"]`)
          : artifact.locator('a[name="legacy"]');
        await expect(destination).toBeFocused();
        await expect(destination).toBeInViewport();
        if (id === 'authored-tabindex') {
          await expect(destination).toHaveAttribute('tabindex', '0');
          await page.keyboard.press('Tab');
          await expect(artifact.locator('#after-target')).toBeFocused();
        } else {
          await expect(destination).toHaveAttribute('tabindex', '-1');
          await link.focus();
          await expect(destination).not.toHaveAttribute('tabindex');
        }
      }
      expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
      expect(await artifact.locator('html').evaluate(() => history.length)).toBe(historyLength);
      expect(unexpectedRequests).toEqual([]);
    });
    for (const format of ['markdown', 'html']) {
      test(`fragment links retain ${mode} ${format} content with ${delivery}`, async ({ page }) => {
        const response = await page.goto(`${origin}${prefix}/fragments-${format}-${mode}.html`);
        expect(response!.headers()['content-security-policy']).toBe(
          delivery === 'headers' ? CONTENT_SECURITY_POLICY : undefined,
        );
        if (mode === 'protected') {
          await page.locator('#password').fill(password);
          await page.locator('#unlock').click();
        }
        const artifact = page.frameLocator('#viewer');
        await expect(artifact.locator('h1')).toHaveText('Fragment fixture');
        const requests: string[] = [];
        page.on('request', (request) => requests.push(request.url()));
        await artifact.getByRole('link', { name: 'Jump to target' }).click();
        await expect(artifact.locator('h2')).toBeInViewport();
        expect(await artifact.locator('html').evaluate(() => window.scrollY)).toBeGreaterThan(1000);
        await artifact.getByRole('link', { name: 'Missing target' }).click();
        await artifact.getByRole('link', { name: 'Malformed fragment' }).click();
        await expect(artifact.locator('h1')).toHaveText('Fragment fixture');
        if (format === 'html') {
          await artifact.getByRole('link', { name: 'Named target' }).click();
          await expect(artifact.locator('a[name="legacy"]')).toBeInViewport();
          await artifact.locator('#counter').click();
          await expect(artifact.locator('#counter')).toHaveText('1');
        }
        await artifact.getByRole('link', { name: 'Back to top' }).click();
        await expect.poll(() => artifact.locator('html').evaluate(() => window.scrollY)).toBe(0);
        await artifact.getByRole('link', { name: 'Jump to target' }).focus();
        await page.keyboard.press('Enter');
        await expect(artifact.locator('h2')).toBeInViewport();
        expect(await artifact.locator('html').evaluate(() => location.href)).toBe('about:srcdoc');
        expect(await artifact.locator('html').evaluate(() => document.compatMode)).toBe(
          'CSS1Compat',
        );
        await expect(page.locator('#viewer')).toHaveAttribute(
          'sandbox',
          'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox',
        );
        expect(requests).toEqual([]);
        expect(unexpectedRequests).toEqual([]);
      });
    }
    if (delivery === 'meta-only')
      test(`meta-only CSP keeps ${mode} content opaque and blocks network resources`, async ({
        page,
      }) => {
        const response = await page.goto(`${origin}/meta-only/${mode}.html`);
        expect(response!.headers()['content-security-policy']).toBeUndefined();
        expect(response!.headers()['x-frame-options']).toBeUndefined();
        await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
          'content',
          META_CONTENT_SECURITY_POLICY,
        );
        expect(META_CONTENT_SECURITY_POLICY).not.toContain('frame-ancestors');
        await page.evaluate(() => localStorage.setItem('canary', 'parent-only'));
        if (mode === 'protected') {
          await page.locator('#password').fill(password);
          await page.locator('#unlock').click();
        }
        const artifact = page.frameLocator('#viewer');
        await expect(artifact.locator('#isolation')).toHaveText('isolated');
        await expect(artifact.locator('#network')).toHaveText('blocked');
        await expect(artifact.locator('#policy')).toHaveText('connect-src');
        await artifact.locator('#counter').click();
        await expect(artifact.locator('#counter')).toHaveText('1');
        const isolation = await artifact.locator('html').evaluate(() => {
          const result: string[] = [];
          try {
            void parent.document;
          } catch {
            result.push('parent DOM blocked');
          }
          try {
            void localStorage;
          } catch {
            result.push('own storage blocked');
          }
          return result;
        });
        expect(isolation).toEqual(['parent DOM blocked', 'own storage blocked']);
        const directives = await artifact.locator('body').evaluate(async (body) => {
          const expected = new Set(['img-src', 'script-src-elem', 'style-src-elem']);
          const blocked = new Set<string>();
          const complete = new Promise<string[]>((resolve) => {
            document.addEventListener('securitypolicyviolation', (event) => {
              if (expected.has(event.effectiveDirective)) blocked.add(event.effectiveDirective);
              if (blocked.size === expected.size) resolve([...blocked].sort());
            });
          });
          const image = document.createElement('img');
          image.src = new URL('/leak-image', document.baseURI).href;
          const script = document.createElement('script');
          script.src = new URL('/leak-script', document.baseURI).href;
          const style = document.createElement('link');
          style.rel = 'stylesheet';
          style.href = new URL('/leak-style', document.baseURI).href;
          body.append(image, script, style);
          return complete;
        });
        expect(directives).toEqual(['img-src', 'script-src-elem', 'style-src-elem']);
        expect(unexpectedRequests).toEqual([]);
        expect(await page.evaluate(() => localStorage.getItem('canary'))).toBe('parent-only');
        expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
        await expect(page.locator('#password')).toHaveValue('');
      });
  }
}

test('frame-ancestors blocks outer viewer embedding only with HTTP headers', async ({ page }) => {
  const blocked = page.waitForEvent('console', (message) =>
    message.text().includes("frame-ancestors 'none'"),
  );
  await page.goto(`${origin}/embed-header.html`);
  await blocked;
  await expect(page.frameLocator('#hosted').locator('#gate')).toHaveCount(0);
  await page.goto(`${origin}/embed-meta.html`);
  await expect(page.frameLocator('#hosted').locator('#gate')).toBeVisible();
});
