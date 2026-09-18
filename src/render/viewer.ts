import { readFile } from 'node:fs/promises';

import type { Config } from '#core/types';
import type { Ciphertext, Protector } from '#security/staticrypt';
import { META_CONTENT_SECURITY_POLICY } from '#security/policy';
import { escapeHtml, scriptJson } from './escape.js';

export type ViewerPayload =
  | { readonly mode: 'protected'; readonly ciphertext: string; readonly salt: string }
  | { readonly mode: 'public'; readonly body: string };

export async function buildViewer(
  payload: ViewerPayload,
  config: Config,
  browserCrypto = '',
): Promise<string> {
  const [css, viewerScript] = await Promise.all([
    readFile(new URL('../../assets/viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../../assets/viewer.js', import.meta.url), 'utf8'),
  ]);
  const protectedMode = payload.mode === 'protected';
  const accent = /^#[\da-f]{6}$/i.test(config.brand.accent) ? config.brand.accent : '#0f766e';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(META_CONTENT_SECURITY_POLICY)}">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${protectedMode ? 'Protected exhibit' : 'Public exhibit'}</title>
<style>${css}\n:root{--accent:${accent}}</style></head>
<body><main class="gate" id="gate"><section class="card" aria-labelledby="gate-title">
<div class="brand"><span class="mark" aria-hidden="true">×</span>${escapeHtml(config.brand.name)}</div>
<h1 id="gate-title">An exhibit, just for you.</h1>
<p>Enter the password from the sender. Your browser unlocks the artifact locally.</p>
<form id="unlock-form"><label for="password">Artifact password</label>
<input id="password" name="password" type="password" autocomplete="off" required maxlength="1024" aria-describedby="status">
<button type="submit" id="unlock">Unlock exhibit</button><p class="status" id="status" role="status" aria-live="polite"></p></form>
<div class="footnote">No account. No password sent to a server. Keep the link and password private.</div>
<noscript><p>JavaScript is required to view this artifact.</p></noscript></section></main>
<header class="toolbar" id="toolbar" hidden><span>${escapeHtml(config.brand.name)} <span aria-hidden="true">/</span> <span id="mode-label">Decrypted locally</span></span><button id="lock" type="button">Lock</button></header>
<iframe class="viewer" id="viewer" title="Exhibit artifact" sandbox="allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" hidden></iframe>
<script type="application/json" id="exhibit-payload">${scriptJson(payload)}</script>
<script>${browserCrypto}\n${viewerScript}\nwindow.ExhibitViewer(${protectedMode ? 'exhibitEngine, exhibitCodec' : 'null, null'});</script>
</body></html>`;
}

export async function protectHtml(html: string, password: string, config: Config, protector: Protector): Promise<string> {
  const payload: Ciphertext = await protector.encrypt(html, password);
  return buildViewer({ mode: 'protected', ...payload }, config, await protector.browserSource());
}

export function publicHtml(html: string, config: Config): Promise<string> {
  return buildViewer({ mode: 'public', body: Buffer.from(html, 'utf8').toString('base64') }, config);
}
