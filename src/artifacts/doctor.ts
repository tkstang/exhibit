import { randomBytes } from 'node:crypto';

import { ExhibitError, normalizeError } from '#core/errors';
import { objectKey, publicUrl, sha256 } from '#core/identity';
import type { ArtifactStore, Config, PutArtifact } from '#core/types';
import { SECURITY_HEADERS } from '#security/policy';
import { createProtector } from '#security/staticrypt';
import type { Protector } from '#security/staticrypt';
import { buildViewer } from '#render/viewer';

export interface Check {
  readonly name: string;
  readonly status: 'pass' | 'warn' | 'fail' | 'skipped';
  readonly message: string;
}

export async function readResponseText(response: Response, maximum = 512 * 1024): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new ExhibitError('E_NETWORK', 'The public response has no body.');
  const buffers: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximum)
        throw new ExhibitError('E_NETWORK', 'The public probe response is unexpectedly large.');
      buffers.push(result.value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(buffers));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function doctor(
  config: Config,
  store: ArtifactStore,
  options: { readonly probe?: boolean } = {},
  dependencies: {
    readonly fetch?: typeof fetch;
    readonly protector?: Protector;
    readonly build?: typeof buildViewer;
  } = {},
) {
  const checks: Check[] = [{ name: 'config', status: 'pass', message: 'Configuration is valid.' }];
  try {
    await store.checkAccess();
    checks.push({
      name: 's3-read',
      status: 'pass',
      message: 'Signed prefix listing succeeded (credentials, bucket, and list permission).',
    });
  } catch (error) {
    checks.push({ name: 's3-read', status: 'fail', message: normalizeError(error).message });
  }
  if (!options.probe || checks.some((check) => check.status === 'fail')) {
    checks.push({
      name: 'active-probe',
      status: 'skipped',
      message:
        'Use doctor --probe to write a temporary encrypted fixture, fetch it, test conditionals, and delete it.',
    });
    return { healthy: !checks.some((check) => check.status === 'fail'), checks, cleanup_key: null };
  }
  const slug = `doctor-${randomBytes(12).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  const original =
    '<!doctype html><html><body><p>Exhibit non-sensitive diagnostic probe</p></body></html>';
  let expectedDigest: string | null = null;
  let attemptedPut = false;
  let cleanupKey: string | null = null;
  try {
    const protector = dependencies.protector ?? createProtector();
    const cipher = await protector.encrypt(original, password);
    if ((await protector.decrypt(cipher, password)) !== original)
      throw new ExhibitError('E_ENCRYPTION', 'The encryption round trip failed.');
    checks.push({
      name: 'encryption',
      status: 'pass',
      message: 'StatiCrypt encrypt/decrypt round trip passed.',
    });
    const body = await (dependencies.build ?? buildViewer)(
      { mode: 'protected', ...cipher },
      config,
      await protector.browserSource(),
    );
    expectedDigest = sha256(body);
    const now = new Date().toISOString();
    const input: PutArtifact = {
      slug,
      body,
      protected: true,
      type: 'html',
      kind: 'probe',
      createdAt: now,
      updatedAt: now,
    };
    attemptedPut = true;
    await store.put(input);
    checks.push({ name: 's3-write', status: 'pass', message: 'Temporary probe uploaded.' });
    try {
      const response = await (dependencies.fetch ?? fetch)(publicUrl(config, slug), {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'text/html' },
      });
      if (!response.ok)
        throw new ExhibitError('E_NETWORK', 'The CDN did not return a successful response.');
      const served = await readResponseText(response);
      if (sha256(served) !== expectedDigest)
        throw new ExhibitError('E_NETWORK', 'The CDN content does not match the uploaded probe.');
      checks.push({
        name: 'public-read',
        status: 'pass',
        message: 'The public URL served exactly the encrypted bytes uploaded to S3.',
      });
      const inline =
        (response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html') &&
        !(response.headers.get('content-disposition') ?? '').toLowerCase().startsWith('attachment');
      checks.push({
        name: 'inline-html',
        status: inline ? 'pass' : 'fail',
        message: inline
          ? 'HTML is served inline.'
          : 'Fix Content-Type / Content-Disposition before sharing.',
      });
      for (const [name, expected] of Object.entries(SECURITY_HEADERS)) {
        const actual = response.headers.get(name);
        checks.push({
          name: `header:${name}`,
          status: actual === expected ? 'pass' : 'warn',
          message:
            actual === expected
              ? 'Matches the reference policy.'
              : 'Missing or differs from the reference policy. Review docs/security-model.md.',
        });
      }
      checks.push({
        name: 'cache-control',
        status: response.headers.get('cache-control')?.includes('no-store') ? 'pass' : 'warn',
        message:
          'The reference deployment uses no-store; cache retention weakens replacement/removal freshness.',
      });
    } catch (error) {
      checks.push({
        name: 'public-read',
        status: 'fail',
        message:
          error instanceof ExhibitError
            ? error.message
            : 'Public retrieval failed. Check TLS, origin path, DNS, and CDN propagation.',
      });
    }
    // Probe-only capability tests. Never silently assume every S3-compatible service honors conditions.
    const expectConflict = async (name: string, operation: () => Promise<unknown>) => {
      try {
        await operation();
        checks.push({
          name,
          status: 'fail',
          message:
            'The server accepted a request that should fail. Do not use this backend until conditional operations are enforced.',
        });
      } catch (error) {
        checks.push({
          name,
          status: error instanceof ExhibitError && error.code === 'E_CONFLICT' ? 'pass' : 'fail',
          message:
            error instanceof ExhibitError && error.code === 'E_CONFLICT'
              ? 'The stale/duplicate request was rejected.'
              : 'Could not verify this conditional operation.',
        });
      }
    };
    await expectConflict('create-only', () => store.put(input));
    await expectConflict('conditional-overwrite', () =>
      store.put({ ...input, expectedEtag: '"exhibit-impossible-etag"' }),
    );
    await expectConflict('conditional-delete', () =>
      store.remove(slug, '"exhibit-impossible-etag"'),
    );
  } catch (error) {
    checks.push({ name: 'probe', status: 'fail', message: normalizeError(error).message });
  } finally {
    if (attemptedPut) {
      try {
        const current = await store.head(slug);
        if (current) {
          if (current.kind !== 'probe' || current.bodySha256 !== expectedDigest)
            throw new ExhibitError('E_CONFLICT', 'Probe identity changed; refusing cleanup.');
          await store.remove(slug, current.etag);
        }
        checks.push({
          name: 'cleanup',
          status: 'pass',
          message: 'Temporary origin probe is absent.',
        });
      } catch {
        cleanupKey = objectKey(config, slug);
        checks.push({
          name: 'cleanup',
          status: 'fail',
          message:
            'Probe cleanup could not be confirmed. Remove the reported non-sensitive cleanup_key manually.',
        });
      }
    }
  }
  return {
    healthy: !checks.some((check) => check.status === 'fail'),
    checks,
    cleanup_key: cleanupKey,
  };
}
