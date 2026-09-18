import { ExhibitError } from '#core/errors';
import { objectKey, normalizePrefix, requireSlug, sha256, validateSlug } from '#core/identity';
import type { ArtifactStore, Config, PutArtifact, StoredArtifact } from '#core/types';
import { CACHE_CONTROL } from '#security/policy';
import type { HeadResponse, PutRequest, S3Transport } from './transport.js';

function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  if ('name' in error && typeof error.name === 'string') return error.name;
  return '';
}
function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
  const meta = error.$metadata;
  return typeof meta === 'object' &&
    meta !== null &&
    'httpStatusCode' in meta &&
    typeof meta.httpStatusCode === 'number'
    ? meta.httpStatusCode
    : undefined;
}
export function translateS3Error(error: unknown): ExhibitError {
  if (error instanceof ExhibitError) return error;
  const name = errorName(error);
  const code = status(error);
  if (
    code === 409 ||
    code === 412 ||
    name === 'PreconditionFailed' ||
    name === 'ConditionalRequestConflict'
  ) {
    return new ExhibitError('E_CONFLICT', 'The object exists or changed during this operation.', {
      hint: 'Refresh with exhibit list. Use --overwrite deliberately; retry only after checking the current artifact.',
    });
  }
  if (
    [
      'CredentialsProviderError',
      'InvalidAccessKeyId',
      'ExpiredToken',
      'InvalidToken',
      'SignatureDoesNotMatch',
    ].includes(name)
  ) {
    return new ExhibitError(
      'E_CREDENTIALS',
      'AWS/S3 credentials are missing, expired, or invalid.',
      {
        hint: 'Check AWS_PROFILE, role credentials, or AWS environment variables. Never put keys in Exhibit config.',
      },
    );
  }
  if (code === 403 || name === 'AccessDenied' || name === 'NoSuchBucket') {
    return new ExhibitError(
      'E_BUCKET_ACCESS',
      'The bucket or object operation was denied or the bucket is unavailable.',
      {
        hint: 'Check the bucket, region, prefix, and publisher IAM policy. See docs/user-guide/deployment/s3.md.',
      },
    );
  }
  if (name === 'NotImplemented' || code === 501) {
    return new ExhibitError(
      'E_STORAGE',
      'This S3-compatible server does not support a required conditional operation.',
      {
        hint: 'Exhibit will not retry an unconditional write/delete. See docs/user-guide/deployment/s3-compatible.md.',
      },
    );
  }
  return new ExhibitError('E_STORAGE', 'The S3 operation did not complete successfully.', {
    exitCode: 2,
    hint: 'Check connectivity and the S3 endpoint. A timed-out write may have succeeded; inspect the slug before retrying.',
  });
}

export function buildPutRequest(config: Config, input: PutArtifact): PutRequest {
  return {
    Bucket: config.storage.bucket,
    Key: objectKey(config, input.slug),
    Body: input.body,
    ContentType: 'text/html; charset=utf-8',
    ContentDisposition: 'inline',
    CacheControl: CACHE_CONTROL,
    ...(input.expectedEtag ? { IfMatch: input.expectedEtag } : { IfNoneMatch: '*' }),
    // No filename, title, password, plaintext digest, or source path in metadata.
    Metadata: {
      'exhibit-format': '1',
      'exhibit-kind': input.kind,
      'exhibit-type': input.type,
      'exhibit-protected': String(input.protected),
      'exhibit-created-at': input.createdAt,
      'exhibit-updated-at': input.updatedAt,
      'exhibit-body-sha256': sha256(input.body),
    },
  };
}

export function decodeHead(config: Config, slug: string, response: HeadResponse): StoredArtifact {
  const meta = response.Metadata ?? {};
  const kind = meta['exhibit-kind'];
  const type = meta['exhibit-type'];
  const protectedValue = meta['exhibit-protected'];
  const created = meta['exhibit-created-at'];
  const updated = meta['exhibit-updated-at'];
  const digest = meta['exhibit-body-sha256'];
  if (
    meta['exhibit-format'] !== '1' ||
    !['artifact', 'probe'].includes(kind ?? '') ||
    !['markdown', 'html'].includes(type ?? '') ||
    !['true', 'false'].includes(protectedValue ?? '') ||
    !created ||
    !updated ||
    !Number.isFinite(Date.parse(created)) ||
    !Number.isFinite(Date.parse(updated)) ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !response.ETag
  ) {
    throw new ExhibitError('E_NOT_MANAGED', 'This object is not a recognized Exhibit artifact.', {
      hint: 'Use a different slug or prefix. Exhibit never overwrites or deletes unrecognized objects.',
    });
  }
  return {
    slug: requireSlug(slug),
    key: objectKey(config, slug),
    type: type as 'markdown' | 'html',
    kind: kind as 'artifact' | 'probe',
    protected: protectedValue === 'true',
    etag: response.ETag,
    createdAt: created,
    updatedAt: updated,
    bodySha256: digest,
    size: response.ContentLength ?? 0,
    contentType: response.ContentType ?? '',
    contentDisposition: response.ContentDisposition ?? '',
  };
}

export function createS3Store(config: Config, transport: S3Transport): ArtifactStore {
  const prefix = normalizePrefix(config.storage.prefix);
  const store: ArtifactStore = {
    async head(slug) {
      try {
        return decodeHead(
          config,
          slug,
          await transport.head({ Bucket: config.storage.bucket, Key: objectKey(config, slug) }),
        );
      } catch (error) {
        const name = errorName(error);
        if (
          name === 'NotFound' ||
          name === 'NoSuchKey' ||
          (status(error) === 404 && name !== 'NoSuchBucket')
        )
          return null;
        throw translateS3Error(error);
      }
    },
    async put(input) {
      const request = buildPutRequest(config, input);
      try {
        const response = await transport.put(request);
        return decodeHead(config, input.slug, {
          ETag: response.ETag,
          ContentLength: Buffer.byteLength(input.body),
          ContentType: request.ContentType,
          ContentDisposition: request.ContentDisposition,
          Metadata: request.Metadata,
        });
      } catch (error) {
        throw translateS3Error(error);
      }
    },
    async list(options) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) {
        throw new ExhibitError('E_USAGE', 'List limit must be an integer from 1 through 1000.');
      }
      try {
        const page = await transport.list({
          Bucket: config.storage.bucket,
          Prefix: prefix,
          Delimiter: '/',
          MaxKeys: options.limit,
          ...(options.cursor ? { ContinuationToken: options.cursor } : {}),
        });
        const artifacts: StoredArtifact[] = [];
        // Bounded batches avoid 1000 simultaneous HeadObject requests.
        const keys = (page.Contents ?? []).flatMap((item) => {
          const key = item.Key;
          if (!key || !key.startsWith(prefix) || !key.endsWith('.html')) return [];
          const slug = key.slice(prefix.length, -5);
          return validateSlug(slug).ok ? [slug] : [];
        });
        for (let index = 0; index < keys.length; index += 8) {
          const batch = await Promise.all(
            keys.slice(index, index + 8).map(async (slug) => {
              try {
                return await store.head(slug);
              } catch (error) {
                if (error instanceof ExhibitError && error.code === 'E_NOT_MANAGED') return null;
                throw error;
              }
            }),
          );
          artifacts.push(
            ...batch.filter(
              (item): item is StoredArtifact => item !== null && item.kind === 'artifact',
            ),
          );
        }
        if (page.IsTruncated && !page.NextContinuationToken)
          throw new ExhibitError(
            'E_STORAGE',
            'The server returned a truncated listing without a continuation cursor.',
            { exitCode: 2 },
          );
        return {
          artifacts,
          nextCursor: page.IsTruncated ? (page.NextContinuationToken ?? null) : null,
        };
      } catch (error) {
        throw translateS3Error(error);
      }
    },
    async remove(slug, etag) {
      if (!etag) throw new ExhibitError('E_STORAGE', 'Conditional deletion requires an ETag.');
      try {
        await transport.remove({
          Bucket: config.storage.bucket,
          Key: objectKey(config, slug),
          IfMatch: etag,
        });
      } catch (error) {
        throw translateS3Error(error);
      }
    },
    async checkAccess() {
      try {
        await transport.list({
          Bucket: config.storage.bucket,
          Prefix: prefix,
          Delimiter: '/',
          MaxKeys: 1,
        });
      } catch (error) {
        throw translateS3Error(error);
      }
    },
  };
  return store;
}
