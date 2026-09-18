export type ErrorCode =
  | 'E_USAGE'
  | 'E_CONFIG'
  | 'E_CONFIG_NOT_FOUND'
  | 'E_CONFIG_EXISTS'
  | 'E_INPUT'
  | 'E_INPUT_SIZE'
  | 'E_INPUT_ENCODING'
  | 'E_INPUT_TYPE'
  | 'E_SLUG'
  | 'E_PASSWORD'
  | 'E_SECRET_DETECTED'
  | 'E_ENCRYPTION'
  | 'E_CREDENTIALS'
  | 'E_BUCKET_ACCESS'
  | 'E_STORAGE'
  | 'E_CONFLICT'
  | 'E_NOT_FOUND'
  | 'E_NOT_MANAGED'
  | 'E_STATE'
  | 'E_NETWORK'
  | 'E_DOCTOR'
  | 'E_DEPENDENCY'
  | 'E_UNEXPECTED';

export class ExhibitError extends Error {
  override readonly name = 'ExhibitError';
  readonly code: ErrorCode;
  readonly hint: string;
  readonly exitCode: 1 | 2;
  readonly details: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { hint?: string; exitCode?: 1 | 2; details?: unknown } = {},
  ) {
    super(message);
    this.code = code;
    this.hint = options.hint ?? 'Run exhibit --help or consult docs/user-guide/troubleshooting.md.';
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
  }
}

export function isExhibitError(value: unknown): value is ExhibitError {
  return value instanceof ExhibitError;
}

export function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Never reflect arbitrary SDK/error text: it can contain credentials or input. */
export function normalizeError(error: unknown): ExhibitError {
  if (isExhibitError(error)) return error;
  return new ExhibitError('E_UNEXPECTED', 'An unexpected operation failed.', {
    exitCode: 2,
    hint: 'Reproduce with a non-sensitive fixture. See docs/user-guide/troubleshooting.md; do not post secrets.',
  });
}
