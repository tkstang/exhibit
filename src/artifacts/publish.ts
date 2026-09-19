import { ExhibitError, normalizeError } from '#core/errors';
import { generateSlug, publicUrl, requireSlug, sha256 } from '#core/identity';
import type {
  ArtifactStore,
  Config,
  PublicationReceipt,
  PublicationState,
  RenderedArtifact,
  Warning,
} from '#core/types';
import { generatePassword, validatePassword } from '#security/password';
import { scanSecrets } from '#security/secret-scan';
import { createProtector } from '#security/staticrypt';
import { protectHtml, publicHtml } from '#render/viewer';
import { readArtifact, renderArtifact } from './input.js';
import type { ArtifactInput } from './input.js';

export interface PublishOptions {
  readonly file: string;
  readonly title?: string;
  readonly slug?: string;
  readonly password?: string;
  readonly public?: boolean;
  readonly overwrite?: boolean;
  readonly allowSecrets?: boolean;
  readonly strictSecrets?: boolean;
  readonly noStorePassword?: boolean;
  readonly dryRun?: boolean;
}
export interface PublishDependencies {
  readonly config: Config;
  readonly store: ArtifactStore;
  readonly state: PublicationState;
  readonly read?: typeof readArtifact;
  readonly render?: (input: ArtifactInput, config: Config) => Promise<RenderedArtifact>;
  readonly protect?: (html: string, password: string, config: Config) => Promise<string>;
  readonly publicView?: typeof publicHtml;
  readonly now?: () => Date;
  readonly makeSlug?: () => string;
}

async function publish(
  options: PublishOptions,
  dependencies: PublishDependencies,
  warnings: Warning[],
) {
  if (options.public && options.password !== undefined)
    throw new ExhibitError('E_USAGE', '--public cannot be combined with a password.');
  if (options.overwrite && !options.slug)
    throw new ExhibitError('E_USAGE', '--overwrite requires an explicit --slug.');
  if (options.allowSecrets && options.strictSecrets)
    throw new ExhibitError('E_USAGE', '--allow-secrets and --strict-secrets cannot be combined.');
  const { config, store, state } = dependencies;
  const slug = requireSlug(options.slug ?? (dependencies.makeSlug ?? generateSlug)());
  const url = publicUrl(config, slug);
  const input = await (dependencies.read ?? readArtifact)(
    options.file,
    config.maxInputBytes,
    options.title,
  );
  const findings = [
    ...scanSecrets(input.text).map((finding) => ({ ...finding, source: 'body' })),
    ...scanSecrets(input.title).map((finding) => ({ ...finding, source: 'title' })),
  ];
  if (input.type === 'html' && options.title !== undefined) {
    warnings.push({
      code: 'W_HTML_TITLE',
      message:
        '--title applies to Markdown. The standalone HTML document keeps its authored title.',
    });
  }
  if (findings.length) {
    if ((options.public || options.strictSecrets) && !options.allowSecrets) {
      throw new ExhibitError(
        'E_SECRET_DETECTED',
        'Potential secrets were found; nothing was uploaded.',
        {
          hint: 'Remove them, or explicitly use --allow-secrets after reviewing the source. Protected mode warns unless --strict-secrets is set.',
          details: { findings },
        },
      );
    }
    warnings.push({
      code: 'W_SECRETS',
      message: `Potential secrets found (${findings.length} matches). Inspect the source before sharing.`,
    });
  }
  const rendered = await (dependencies.render ?? renderArtifact)(input, config);
  warnings.push(...rendered.warnings);
  if (options.password !== undefined) {
    validatePassword(options.password);
    warnings.push({
      code: 'W_CUSTOM_PASSWORD',
      message:
        'A length check does not measure password strength. Use a unique high-entropy password.',
    });
  }
  if (options.dryRun) {
    warnings.push({
      code: 'W_DRY_RUN_LOCAL',
      message:
        'Local render/scan only. Remote existence, ownership, permissions, and conditional operations were not checked.',
    });
    return {
      dry_run: true,
      remote_checked: false,
      slug,
      url,
      source_type: input.type,
      protected: !options.public,
      rendered_bytes: Buffer.byteLength(rendered.html),
      would_overwrite: Boolean(options.overwrite),
      warnings,
    };
  }
  const existing = await store.head(slug);
  if (existing?.kind === 'probe')
    throw new ExhibitError('E_NOT_MANAGED', 'This slug belongs to a diagnostic probe.');
  if (existing && !options.overwrite)
    throw new ExhibitError('E_CONFLICT', 'This slug already exists.', {
      hint: 'Choose another slug, or use --overwrite to replace this Exhibit artifact conditionally.',
    });
  const password = options.public ? null : (options.password ?? generatePassword());
  const body =
    password === null
      ? await (dependencies.publicView ?? publicHtml)(rendered.html, config)
      : await (
          dependencies.protect ??
          ((html, key, settings) => protectHtml(html, key, settings, createProtector()))
        )(rendered.html, password, config);
  const date = (dependencies.now ?? (() => new Date()))().toISOString();
  const bodySha256 = sha256(body);
  const receipt: PublicationReceipt = {
    schemaVersion: 1,
    slug,
    url,
    password,
    bodySha256,
    etag: null,
    status: 'prepared',
    savedAt: date,
  };
  // Save the generated password BEFORE the request. A network error can hide a successful PUT.
  // Digest-addressed receipts preserve both old and new passwords during failed overwrite races.
  const persistPassword = password !== null && !options.noStorePassword;
  if (persistPassword) await state.save(receipt);
  const saved = await store.put({
    slug,
    body,
    type: input.type,
    kind: 'artifact',
    protected: password !== null,
    createdAt: existing?.createdAt ?? date,
    updatedAt: date,
    ...(existing ? { expectedEtag: existing.etag } : {}),
  });
  let stateSaved = false;
  if (!options.noStorePassword) {
    try {
      await state.save({ ...receipt, etag: saved.etag, status: 'published' });
      stateSaved = true;
    } catch {
      stateSaved = persistPassword;
      warnings.push({
        code: 'W_STATE_SAVE',
        message: persistPassword
          ? 'The upload succeeded. The prepared password receipt is retained, but final receipt update failed.'
          : 'The upload succeeded, but local history could not be saved.',
      });
    }
  } else if (password !== null) {
    warnings.push({
      code: 'W_PASSWORD_NOT_STORED',
      message: 'This password is only in the publication result. Save it securely now.',
    });
  }
  return {
    dry_run: false,
    id: slug,
    slug,
    url,
    source_type: input.type,
    protected: password !== null,
    password,
    etag: saved.etag,
    body_sha256: bodySha256,
    size_bytes: saved.size,
    created_at: saved.createdAt,
    updated_at: saved.updatedAt,
    overwritten: existing !== null,
    state_saved: stateSaved,
    warnings,
  };
}

export async function publishArtifact(options: PublishOptions, dependencies: PublishDependencies) {
  const warnings: Warning[] = [];
  try {
    return await publish(options, dependencies, warnings);
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
