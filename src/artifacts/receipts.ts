import { ExhibitError, normalizeError } from '#core/errors';
import { requireSlug } from '#core/identity';
import type { PublicationReceipt, PublicationState, Warning } from '#core/types';

export interface ReceiptDependencies {
  readonly state: Pick<PublicationState, 'read' | 'remove'>;
  enumerate(slug: string): Promise<readonly PublicationReceipt[]>;
}

export async function inspectReceipts(
  dependencies: ReceiptDependencies,
  slug: string,
  options: {
    readonly forget?: string;
    readonly force?: boolean;
    readonly dryRun?: boolean;
    readonly showPasswords?: boolean;
  } = {},
) {
  const warnings: Warning[] = [
    {
      code: 'W_LOCAL_RECEIPTS',
      message:
        'Local receipts are not remote state. Prepared receipts may belong to successful uploads; retained passwords may unlock downloaded or older copies.',
    },
  ];
  try {
    requireSlug(slug);
    const { state } = dependencies;
    if (options.forget !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(options.forget))
        throw new ExhibitError(
          'E_USAGE',
          '--forget requires an exact lowercase SHA-256 receipt digest.',
        );
      if (options.showPasswords)
        throw new ExhibitError(
          'E_USAGE',
          'Inspect passwords separately before forgetting a receipt.',
        );
      if (!options.force && !options.dryRun)
        throw new ExhibitError('E_USAGE', 'Forgetting a password receipt requires --force.', {
          hint: 'Inspect the exact receipt first. Removal may destroy the only password for a live artifact or downloaded copy. Use --dry-run to inspect without deletion.',
        });
      const receipt = await state.read(slug, options.forget);
      if (!receipt)
        throw new ExhibitError('E_NOT_FOUND', 'The selected local receipt does not exist.');
      warnings.push({
        code: 'W_FORGET_PASSWORD',
        message:
          'Forgetting this receipt does not remove any remote artifact or revoke copies. Its password may be unrecoverable.',
      });
      if (!options.dryRun) await state.remove(slug, options.forget);
      return {
        slug,
        body_sha256: options.forget,
        dry_run: Boolean(options.dryRun),
        forgotten: !options.dryRun,
        remote_checked: false,
        warnings,
      };
    }
    if (options.force || options.dryRun)
      throw new ExhibitError('E_USAGE', '--force and --dry-run require --forget.');
    const receipts = await dependencies.enumerate(slug);
    return {
      slug,
      remote_checked: false,
      receipts: receipts.map((receipt) => ({
        body_sha256: receipt.bodySha256,
        status: receipt.status,
        saved_at: receipt.savedAt,
        url: receipt.url,
        etag: receipt.etag,
        has_password: receipt.password !== null,
        ...(options.showPasswords ? { password: receipt.password } : {}),
      })),
      warnings,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    throw new ExhibitError(normalized.code, normalized.message, {
      hint: normalized.hint,
      exitCode: normalized.exitCode,
      details: normalized.details,
      warnings: [...warnings, ...normalized.warnings],
    });
  }
}
