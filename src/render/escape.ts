export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Safe inside a non-executable <script type="application/json"> element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

export function isSafeLink(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (/[\x00-\x20\x7f]/.test(href)) return false;
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(href).protocol); }
  catch { return false; }
}
