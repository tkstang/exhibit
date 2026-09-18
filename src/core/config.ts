import { lstat } from 'node:fs/promises';
import { z } from 'zod';

import { ExhibitError, hasCode } from './errors.js';
import { normalizePrefix } from './identity.js';
import { readTextFile, writePrivateJson } from './files.js';
import type { Config } from './types.js';

function safeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const UrlSchema = z
  .string()
  .max(2048)
  .refine(
    safeUrl,
    'Use HTTPS without credentials, query, or fragment (HTTP allowed only on loopback).',
  );
export const ConfigSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    storage: z
      .object({
        provider: z.literal('s3').default('s3'),
        bucket: z
          .string()
          .min(3)
          .max(63)
          .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
        region: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-zA-Z0-9-]+$/),
        prefix: z
          .string()
          .default('exhibit/')
          .transform((value, context) => {
            try {
              return normalizePrefix(value);
            } catch {
              context.addIssue({ code: 'custom', message: 'Invalid prefix.' });
              return z.NEVER;
            }
          }),
        endpoint: UrlSchema.optional(),
        forcePathStyle: z.boolean().default(false),
      })
      .strict(),
    publicBaseUrl: UrlSchema.transform((value) => value.replace(/\/$/, '')),
    maxInputBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024)
      .default(2 * 1024 * 1024),
    brand: z
      .object({
        name: z.string().trim().min(1).max(80).default('Exhibit'),
        accent: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#0f766e'),
      })
      .strict()
      .default({ name: 'Exhibit', accent: '#0f766e' }),
  })
  .strict();

export function parseConfig(value: unknown): Config {
  const result = ConfigSchema.safeParse(value);
  if (!result.success) {
    throw new ExhibitError('E_CONFIG', 'Invalid Exhibit configuration.', {
      hint: 'See docs/user-guide/configuration.md. Credentials do not belong in Exhibit config.',
      // Report field paths only, never invalid values or unknown property names.
      details: {
        invalidFields: result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
      },
    });
  }
  return result.data;
}

export async function loadConfig(path: string): Promise<Config> {
  try {
    await lstat(path);
  } catch (error) {
    if (hasCode(error, 'ENOENT'))
      throw new ExhibitError('E_CONFIG_NOT_FOUND', 'Exhibit is not configured.', {
        hint: 'Run exhibit init --bucket <bucket> --region <region> --public-base-url <URL>.',
      });
    throw new ExhibitError('E_CONFIG', 'Unable to inspect the config file.');
  }
  const text = await readTextFile(path, 64 * 1024);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExhibitError('E_CONFIG', 'Configuration is not valid JSON.');
  }
  return parseConfig(parsed);
}

export async function saveConfig(path: string, value: unknown, force = false): Promise<Config> {
  const config = parseConfig(value);
  await writePrivateJson(path, config, force, false);
  return config;
}
