import { randomBytes } from 'node:crypto';
import { ExhibitError } from '#core/errors';

/** 24 CSPRNG bytes -> 32 URL-safe characters (192 random bits). */
export function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

export function validatePassword(value: string): string {
  if (
    value.length < 16 ||
    Buffer.byteLength(value, 'utf8') > 1024 ||
    // oxlint-disable-next-line no-control-regex -- Reject control characters in secrets.
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    throw new ExhibitError('E_PASSWORD', 'Use a unique password of at least 16 characters.', {
      hint: 'Omit password options to generate one. Custom passwords must contain no control characters and be at most 1024 UTF-8 bytes.',
    });
  }
  return value;
}
