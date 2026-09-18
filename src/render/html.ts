import { ExhibitError } from '#core/errors';
import type { Config, RenderedArtifact } from '#core/types';

/** Preserve authored bytes. The separate viewer supplies isolation, UI, and metadata. */
export function renderHtml(source: string, _title: string, _config: Config): RenderedArtifact {
  if (!source.trim()) throw new ExhibitError('E_INPUT', 'The HTML document is empty.');
  const warnings = [];
  if (/<(?:script|link|img|iframe|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["']?(?!data:|#)/i.test(source)) {
    warnings.push({ code: 'W_EXTERNAL_ASSETS', message: 'This HTML may reference separate resources. Exhibit only publishes this file; the default CSP blocks external resources.' });
  }
  if (!/<html(?:\s|>)/i.test(source)) {
    warnings.push({ code: 'W_HTML_FRAGMENT', message: 'This is an HTML fragment. The browser will infer a document; a standalone HTML document is recommended.' });
  }
  return { html: source, warnings };
}
