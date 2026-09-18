import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

import type { Config, RenderedArtifact, Warning } from '#core/types';
import { escapeHtml, isSafeLink } from './escape.js';

/** GFM parser + sanitizer. Raw HTML is displayed as text, never executed. */
export function renderMarkdown(source: string, title: string, config: Config): RenderedArtifact {
  const warnings: Warning[] = [];
  const seen = new Map<string, number>();
  const parser = new Marked({ gfm: true, breaks: false, async: false });
  parser.use({
    renderer: {
      html({ text }) {
        warnings.push({
          code: 'W_RAW_HTML',
          message:
            'Raw HTML in Markdown is shown as text. Use an HTML artifact for executable content.',
        });
        return escapeHtml(text);
      },
      image({ text }) {
        warnings.push({
          code: 'W_IMAGE_OMITTED',
          message:
            'A Markdown image was omitted. External/local assets are not uploaded in single-file mode.',
        });
        return `<span class="omitted-image">[Image: ${escapeHtml(text || 'untitled')}]</span>`;
      },
      heading({ depth, text, tokens }) {
        const base =
          text
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .trim()
            .replace(/\s+/g, '-') || 'section';
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  const rendered = parser.parse(source, { async: false });
  const body = sanitizeHtml(rendered, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'em',
      'strong',
      'del',
      's',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'input',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      code: ['class'],
      th: ['align'],
      td: ['align'],
      ol: ['start'],
      input: ['type', 'checked', 'disabled'],
      span: ['class'],
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        if (!isSafeLink(attributes.href ?? '')) {
          warnings.push({
            code: 'W_LINK_OMITTED',
            message:
              'An unsafe or relative file link was rendered as text. Publish the target separately and use an absolute URL.',
          });
          return { tagName: 'span', attribs: {} };
        }
        return {
          tagName: 'a',
          attribs: {
            ...attributes,
            rel: 'noopener noreferrer',
            ...(attributes.href?.startsWith('#') ? {} : { target: '_blank' }),
          },
        };
      },
      input: (_tag, attributes) => ({
        tagName: 'input',
        attribs: {
          type: 'checkbox',
          disabled: '',
          ...(attributes.checked !== undefined ? { checked: '' } : {}),
        },
      }),
    },
  });
  const accent = /^#[\da-f]{6}$/i.test(config.brand.accent) ? config.brand.accent : '#0f766e';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fbfcfd;--paper:#fff;--fg:#18212f;--muted:#5c6a79;--line:#e1e7ee;--code:#f1f5f8;--accent:${accent}}
@media(prefers-color-scheme:dark){:root{--bg:#111720;--paper:#18212d;--fg:#e4ebf4;--muted:#a0aebd;--line:#303d4e;--code:#202c3a;--accent:#5eead4}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.75 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.document{max-width:920px;margin:56px auto;padding:44px 52px;background:var(--paper);border:1px solid var(--line);border-radius:16px}
.eyebrow{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);margin-bottom:28px}
h1,h2,h3,h4,h5,h6{line-height:1.25;letter-spacing:-.025em;scroll-margin-top:24px}h1{font-size:2.3em;margin:0 0 28px}h2{font-size:1.55em;margin-top:42px;padding-bottom:10px;border-bottom:1px solid var(--line)}h3{font-size:1.18em;margin-top:30px}
p{margin:0 0 18px}a{color:var(--accent);text-underline-offset:3px}pre,code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em}code{background:var(--code);padding:.12em .35em;border-radius:4px}pre{background:var(--code);border:1px solid var(--line);border-radius:10px;padding:20px;overflow:auto;line-height:1.65}pre code{padding:0;background:none}
blockquote{border-left:3px solid var(--accent);padding:4px 20px;margin:24px 0;color:var(--muted)}blockquote p:last-child{margin:0}ul,ol{padding-left:1.5em}li{margin:.35em 0}li>input{margin-right:.6em}
table{display:block;width:100%;overflow:auto;border-collapse:collapse;margin:24px 0;font-size:.94em}th,td{padding:10px 14px;border:1px solid var(--line);text-align:left}th{background:var(--code)}hr{border:0;border-top:1px solid var(--line);margin:32px 0}.omitted-image{font-size:.9em;color:var(--muted);font-style:italic}footer{border-top:1px solid var(--line);margin-top:42px;padding-top:18px;font-size:12px;color:var(--muted)}
@media(max-width:640px){.document{margin:0;border:0;border-radius:0;padding:28px 20px}body{font-size:16px}h1{font-size:1.9em}}
@media print{body{background:#fff;color:#000}.document{margin:0;max-width:none;border:0;padding:0}pre,table{break-inside:avoid}a{color:inherit}footer{display:none}}
</style></head><body><main class="document"><div class="eyebrow">${escapeHtml(config.brand.name)} · Artifact</div>${body}<footer>Published with Exhibit. This is a snapshot of the source document.</footer></main></body></html>`;
  return {
    html,
    warnings: [...new Map(warnings.map((warning) => [warning.code, warning])).values()],
  };
}
