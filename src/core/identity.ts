import { createHash, randomBytes } from 'node:crypto';

import { ExhibitError } from './errors.js';
import type { Config, Result } from './types.js';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function validateSlug(value: string): Result<string, string> {
  if (!SLUG.test(value)) {
    return { ok: false, error: 'Use 1–64 lowercase letters, digits, and interior hyphens.' };
  }
  return { ok: true, value };
}

export function requireSlug(value: string): string {
  const result = validateSlug(value);
  if (!result.ok)
    throw new ExhibitError('E_SLUG', 'Invalid artifact slug.', { hint: result.error });
  return result.value;
}

/** Opaque by default: filenames and document titles may themselves be sensitive. */
export function generateSlug(): string {
  return `exhibit-${randomBytes(10).toString('hex')}`;
}

export function normalizePrefix(value: string): string {
  if (value === '') return '';
  const raw = value.endsWith('/') ? value.slice(0, -1) : value;
  const parts = raw.split('/');
  if (raw.length > 512 || parts.some((part) => !SEGMENT.test(part))) {
    throw new ExhibitError('E_CONFIG', 'Invalid storage prefix.', {
      hint: 'Use slash-separated alphanumeric segments; no leading slash, traversal, %, or backslashes.',
    });
  }
  return `${raw}/`;
}

export function normalizeDirectory(value: string): string {
  if (value !== '') {
    try {
      return normalizePrefix(value);
    } catch {
      // CLI paths use a usage error, without echoing the supplied value.
    }
  }
  throw new ExhibitError('E_USAGE', 'Invalid --dir path.', {
    hint: 'Use a relative slash-separated path with alphanumeric segments; no traversal, %, or backslashes.',
  });
}

/** Scope storage, URLs, and receipt identity together beneath the configured root. */
export function scopeDirectory(config: Config, directory?: string): Config {
  if (directory === undefined) return config;
  const suffix = normalizeDirectory(directory);
  const prefix = `${normalizePrefix(config.storage.prefix)}${suffix}`;
  const publicBaseUrl = `${config.publicBaseUrl.replace(/\/$/, '')}/${suffix.slice(0, -1)}`;
  if (prefix.length > 513 || publicBaseUrl.length > 2048)
    throw new ExhibitError('E_USAGE', '--dir exceeds the configured path length limit.');
  return { ...config, storage: { ...config.storage, prefix }, publicBaseUrl };
}

export function objectKey(config: Config, slug: string): string {
  return `${normalizePrefix(config.storage.prefix)}${requireSlug(slug)}.html`;
}

/** Base URL maps to the configured prefix. The prefix is NOT appended twice. */
export function publicUrl(config: Config, slug: string): string {
  return `${config.publicBaseUrl.replace(/\/$/, '')}/${requireSlug(slug)}.html`;
}

export function deploymentId(config: Config): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.storage.endpoint ?? 'aws',
        config.storage.region,
        config.storage.bucket,
        config.storage.prefix,
        config.publicBaseUrl,
      ]),
    )
    .digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
