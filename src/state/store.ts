import { lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { ExhibitError, hasCode } from '#core/errors';
import { ensurePrivateDirectory, readTextFile, writePrivateJson } from '#core/files';
import { deploymentId, requireSlug } from '#core/identity';
import type { Config, PublicationReceipt, PublicationState } from '#core/types';

function validReceipt(value: unknown): value is PublicationReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.slug === 'string' &&
    typeof record.url === 'string' &&
    typeof record.savedAt === 'string' &&
    (record.etag === null || typeof record.etag === 'string') &&
    (record.password === null || typeof record.password === 'string') &&
    (record.status === 'prepared' || record.status === 'published') &&
    typeof record.bodySha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(record.bodySha256)
  );
}

/** Receipts are per deployment + slug + ciphertext digest; overwrites never erase old keys. */
export function createPublicationState(config: Config, stateRoot: string): PublicationState {
  const deployment = join(stateRoot, deploymentId(config));
  const directory = (slug: string) => join(deployment, requireSlug(slug));
  const path = (slug: string, digest: string) => {
    if (!/^[a-f0-9]{64}$/.test(digest))
      throw new ExhibitError('E_STATE', 'Invalid local publication identity.');
    return join(directory(slug), `${digest}.json`);
  };
  return {
    async read(slug, digest) {
      const target = path(slug, digest);
      try {
        const info = await lstat(target);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          (process.platform !== 'win32' && (info.mode & 0o077) !== 0)
        ) {
          throw new ExhibitError(
            'E_STATE',
            'Local publication state has unsafe permissions or type.',
            { hint: 'Receipts must be regular files, mode 0600, in a private directory.' },
          );
        }
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return null;
        throw error;
      }
      let value: unknown;
      try {
        value = JSON.parse(await readTextFile(target, 64 * 1024));
      } catch {
        throw new ExhibitError('E_STATE', 'Local publication state is unreadable or invalid.');
      }
      if (!validReceipt(value) || value.slug !== slug || value.bodySha256 !== digest) {
        throw new ExhibitError(
          'E_STATE',
          'Local publication receipt does not match this artifact.',
        );
      }
      return value;
    },
    async save(receipt) {
      if (!validReceipt(receipt))
        throw new ExhibitError('E_STATE', 'Refusing an invalid publication receipt.');
      await ensurePrivateDirectory(stateRoot);
      await ensurePrivateDirectory(deployment);
      await ensurePrivateDirectory(directory(receipt.slug));
      await writePrivateJson(path(receipt.slug, receipt.bodySha256), receipt);
    },
    async remove(slug) {
      const dir = directory(slug);
      try {
        const info = await lstat(dir);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new ExhibitError('E_STATE', 'Refusing an unsafe local state directory.');
        await rm(dir, { recursive: true, force: false });
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return;
        if (error instanceof ExhibitError) throw error;
        throw new ExhibitError('E_STATE', 'Could not remove local password receipts.');
      }
    },
  };
}
