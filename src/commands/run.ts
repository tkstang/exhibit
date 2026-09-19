import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExhibitError, normalizeError } from '#core/errors';
import { readTextFile } from '#core/files';
import { normalizeDirectory, scopeDirectory } from '#core/identity';
import { userPaths } from '#core/paths';
import type { Config, ArtifactStore, PublicationState, Warning } from '#core/types';
import { publishArtifact } from '#artifacts/publish';
import { listArtifacts, removeArtifact } from '#artifacts/manage';
import { doctor } from '#artifacts/doctor';
import { inspectReceipts } from '#artifacts/receipts';
import type { ReceiptDependencies } from '#artifacts/receipts';
import { validatePassword } from '#security/password';
import { parseCli, wantsJson } from './parse.js';
import type { ParsedArgs } from './parse.js';
import { HELP, VERSION } from './help.js';

export interface Session {
  readonly config: Config;
  readonly store: ArtifactStore;
  readonly state: PublicationState;
  close(): void;
}
export interface RuntimeDependencies {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly loadConfig?: (configFile: string) => Promise<Config>;
  /** Receives directory-scoped config; must not open a cloud session. */
  readonly receipts?: (config: Config, stateDir: string) => Promise<ReceiptDependencies>;
  /** Factories must scope config, storage, and receipts to the normalized directory. */
  readonly session?: (configFile: string, stateDir: string, directory?: string) => Promise<Session>;
  readonly initialize?: (configFile: string, data: unknown, force: boolean) => Promise<Config>;
}
export interface SuccessEnvelope {
  readonly schema_version: 1;
  readonly ok: true;
  readonly command: string;
  readonly data: unknown;
}
export interface FailureEnvelope {
  readonly schema_version: 1;
  readonly ok: false;
  readonly command: string;
  readonly warnings: readonly Warning[];
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly hint: string;
    readonly details?: unknown;
  };
}
export type Envelope = SuccessEnvelope | FailureEnvelope;

async function openReceipts(config: Config, stateDir: string): Promise<ReceiptDependencies> {
  const { createPublicationState, enumerateReceipts } = await import('#state/store');
  return {
    state: createPublicationState(config, stateDir),
    enumerate: (slug) => enumerateReceipts(config, stateDir, slug),
  };
}

async function openSession(
  configFile: string,
  stateDir: string,
  directory?: string,
): Promise<Session> {
  const [{ loadConfig }, { createAwsTransport }, { createS3Store }, { createPublicationState }] =
    await Promise.all([
      import('#core/config'),
      import('#storage/aws'),
      import('#storage/s3-store'),
      import('#state/store'),
    ]);
  const config = scopeDirectory(await loadConfig(configFile), directory);
  const aws = createAwsTransport(config);
  return {
    config,
    store: createS3Store(config, aws.transport),
    state: createPublicationState(config, stateDir),
    close: aws.close,
  };
}
async function resolvePassword(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<string | undefined> {
  const literal = args.text('password');
  const file = args.text('password-file');
  const variable = args.text('password-env');
  if ([literal, file, variable].filter((value) => value !== undefined).length > 1)
    throw new ExhibitError('E_USAGE', 'Choose only one custom password source.');
  if (
    (args.flag('no-encrypt') || args.flag('public')) &&
    [literal, file, variable].some((value) => value !== undefined)
  )
    throw new ExhibitError(
      'E_USAGE',
      '--no-encrypt / --public cannot be combined with a password source.',
    );
  let password = literal;
  if (file !== undefined)
    password = (await readTextFile(resolve(cwd, file), 1026)).replace(/\r?\n$/, '');
  if (variable !== undefined) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(variable))
      throw new ExhibitError('E_PASSWORD', 'Invalid password environment variable name.');
    password = env[variable];
    if (password === undefined)
      throw new ExhibitError('E_PASSWORD', 'The password environment variable is not set.');
  }
  return password === undefined ? undefined : validatePassword(password);
}

/** No process writes here. One outer boundary owns stdout, stderr, and exit status. */
export async function run(
  argv: readonly string[],
  dependencies: RuntimeDependencies = {},
): Promise<{ envelope: Envelope; exitCode: number; json: boolean }> {
  let command = 'unknown';
  let session: Session | undefined;
  let json = wantsJson(argv);
  const warnings: Warning[] = [];
  try {
    const args = parseCli(argv);
    command = args.command;
    json = args.json;
    if (args.command === 'publish' && args.text('password') !== undefined)
      warnings.push({
        code: 'W_PASSWORD_ARG',
        message:
          '--password can appear in shell history/process listings. Prefer --password-env or --password-file.',
      });
    const success = (data: unknown) => ({
      envelope: { schema_version: 1 as const, ok: true as const, command, data },
      exitCode: 0,
      json,
    });
    if (args.command === 'help') return success({ help: HELP });
    if (args.command === 'version')
      return success({
        name: 'Exhibit',
        version: VERSION,
        resources: {
          docs: fileURLToPath(new URL('../../docs/', import.meta.url)),
          skills: fileURLToPath(new URL('../../skills/', import.meta.url)),
          terraform: fileURLToPath(new URL('../../examples/terraform/aws/', import.meta.url)),
        },
      });
    const env = dependencies.env ?? process.env;
    const cwd = dependencies.cwd ?? process.cwd();
    const locations = userPaths(env);
    const configFile = resolve(cwd, args.text('config') ?? locations.configFile);
    if (args.command === 'init') {
      const bucket = args.text('bucket');
      const region = args.text('region');
      const publicBaseUrl = args.text('public-base-url');
      if (!bucket || !region || !publicBaseUrl)
        throw new ExhibitError(
          'E_USAGE',
          'init requires --bucket, --region, and --public-base-url.',
        );
      const initialize = dependencies.initialize ?? (await import('#core/config')).saveConfig;
      const config = await initialize(
        configFile,
        {
          schemaVersion: 1,
          storage: {
            provider: 's3',
            bucket,
            region,
            prefix: args.text('prefix') ?? 'exhibit/',
            ...(args.text('endpoint') ? { endpoint: args.text('endpoint') } : {}),
            forcePathStyle: args.flag('force-path-style'),
          },
          publicBaseUrl,
          brand: { name: args.text('brand-name') ?? 'Exhibit', accent: '#0f766e' },
        },
        args.flag('force'),
      );
      return success({
        config_file: configFile,
        config,
        next: 'Run exhibit doctor --probe after your CDN and IAM configuration is ready.',
      });
    }
    // Validate paths and password options before touching cloud resources.
    const directory = args.text('dir');
    const normalizedDirectory = directory === undefined ? undefined : normalizeDirectory(directory);
    if (args.command === 'receipts') {
      const load = dependencies.loadConfig ?? (await import('#core/config')).loadConfig;
      const config = scopeDirectory(await load(configFile), normalizedDirectory);
      const receipts = await (dependencies.receipts ?? openReceipts)(config, locations.stateDir);
      return success(
        await inspectReceipts(receipts, args.positionals[0]!, {
          forget: args.text('forget'),
          force: args.flag('force'),
          dryRun: args.flag('dry-run'),
          showPasswords: args.flag('show-passwords'),
        }),
      );
    }
    const password = args.command === 'publish' ? await resolvePassword(args, env, cwd) : undefined;
    session = await (dependencies.session ?? openSession)(
      configFile,
      locations.stateDir,
      normalizedDirectory,
    );
    if (args.command === 'publish') {
      const file = args.positionals[0];
      if (!file) throw new ExhibitError('E_USAGE', 'A source file is required.');
      const result = await publishArtifact(
        {
          file: resolve(cwd, file),
          title: args.text('title'),
          slug: args.text('slug'),
          password,
          public: args.flag('no-encrypt') || args.flag('public'),
          overwrite: args.flag('overwrite'),
          allowSecrets: args.flag('allow-secrets'),
          strictSecrets: args.flag('strict-secrets'),
          noStorePassword: args.flag('no-store-password'),
          dryRun: args.flag('dry-run'),
        },
        session,
      );
      result.warnings.push(...warnings);
      return success(result);
    }
    if (args.command === 'list') {
      const limitText = args.text('limit') ?? '100';
      if (!/^\d+$/.test(limitText))
        throw new ExhibitError('E_USAGE', '--limit must be an integer from 1 through 1000.');
      return success(
        await listArtifacts(session.config, session.store, session.state, {
          limit: Number(limitText),
          cursor: args.text('cursor'),
          showPasswords: args.flag('show-passwords'),
        }),
      );
    }
    if (args.command === 'remove') {
      const slug = args.positionals[0];
      if (!slug) throw new ExhibitError('E_USAGE', 'A slug is required.');
      return success(
        await removeArtifact(session.store, session.state, slug, {
          dryRun: args.flag('dry-run'),
          missingOk: args.flag('missing-ok'),
        }),
      );
    }
    const result = await doctor(session.config, session.store, { probe: args.flag('probe') });
    if (!result.healthy)
      throw new ExhibitError('E_DOCTOR', 'One or more deployment checks failed.', {
        hint: 'Inspect details.checks. A cleanup_key, when present, names a non-sensitive probe to remove manually.',
        details: result,
      });
    return success(result);
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      envelope: {
        schema_version: 1,
        ok: false,
        command,
        warnings: [...warnings, ...normalized.warnings],
        error: {
          code: normalized.code,
          message: normalized.message,
          hint: normalized.hint,
          ...(normalized.details === undefined ? {} : { details: normalized.details }),
        },
      },
      exitCode: normalized.exitCode,
      json,
    };
  } finally {
    // Cleanup must not override an already-formed result or leak an SDK exception.
    try {
      session?.close();
    } catch {
      /* SDK cleanup is best-effort. */
    }
  }
}
