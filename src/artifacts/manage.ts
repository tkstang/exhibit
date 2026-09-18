import { ExhibitError } from '#core/errors';
import { publicUrl, requireSlug } from '#core/identity';
import type { ArtifactStore, Config, PublicationState, Warning } from '#core/types';

export async function listArtifacts(
  config: Config,
  store: ArtifactStore,
  state: PublicationState,
  options: { readonly limit: number; readonly cursor?: string; readonly showPasswords?: boolean },
) {
  const page = await store.list({
    limit: options.limit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
  });
  const warnings: Warning[] = [];
  const artifacts = await Promise.all(
    page.artifacts.map(async (artifact) => {
      let password: string | null = null;
      if (options.showPasswords && artifact.protected) {
        try {
          password = (await state.read(artifact.slug, artifact.bodySha256))?.password ?? null;
        } catch {
          warnings.push({
            code: 'W_STATE_READ',
            message: `Could not read the local password receipt for ${artifact.slug}.`,
          });
        }
      }
      return {
        slug: artifact.slug,
        url: publicUrl(config, artifact.slug),
        key: artifact.key,
        source_type: artifact.type,
        protected: artifact.protected,
        etag: artifact.etag,
        size_bytes: artifact.size,
        created_at: artifact.createdAt,
        updated_at: artifact.updatedAt,
        ...(options.showPasswords ? { password } : {}),
      };
    }),
  );
  return { artifacts, next_cursor: page.nextCursor, warnings };
}

export async function removeArtifact(
  store: ArtifactStore,
  state: PublicationState,
  slug: string,
  options: { readonly dryRun?: boolean; readonly missingOk?: boolean } = {},
) {
  requireSlug(slug);
  const existing = await store.head(slug);
  if (!existing) {
    if (!options.missingOk)
      throw new ExhibitError('E_NOT_FOUND', 'No Exhibit artifact exists at this slug.');
    return { slug, removed: false, dry_run: Boolean(options.dryRun), warnings: [] };
  }
  if (existing.kind !== 'artifact')
    throw new ExhibitError('E_NOT_MANAGED', 'This is a diagnostic probe, not an artifact.');
  if (options.dryRun)
    return { slug, key: existing.key, removed: false, dry_run: true, warnings: [] };
  await store.remove(slug, existing.etag);
  const warnings: Warning[] = [
    {
      code: 'W_DELETE_LIMITS',
      message:
        'Current origin object removed. Cached/downloaded copies and old S3 object versions are not revoked.',
    },
  ];
  try {
    await state.remove(slug, existing.bodySha256);
  } catch {
    warnings.push({
      code: 'W_STATE_REMOVE',
      message: 'Remote deletion succeeded; its local password receipt still needs removal.',
    });
  }
  return { slug, key: existing.key, removed: true, dry_run: false, warnings };
}
