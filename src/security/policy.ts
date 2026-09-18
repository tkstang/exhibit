/** Deliberately no network assets, connections, forms, plugins, eval, or remote scripts. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
  'img-src data:', 'font-src data:', 'media-src data: blob:',
  "frame-src 'self' blob:", "connect-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

// frame-ancestors must be an HTTP header; browsers ignore it in a meta element.
export const META_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace("; frame-ancestors 'none'", '');
export const CACHE_CONTROL = 'no-store, max-age=0';
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};
