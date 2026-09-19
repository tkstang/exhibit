import { parseArgs } from 'node:util';
import { ExhibitError } from '#core/errors';

const OPTIONS = {
  config: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  slug: { type: 'string' },
  dir: { type: 'string' },
  title: { type: 'string' },
  password: { type: 'string' },
  'password-env': { type: 'string' },
  'password-file': { type: 'string' },
  public: { type: 'boolean' },
  'no-encrypt': { type: 'boolean' },
  overwrite: { type: 'boolean' },
  'no-store-password': { type: 'boolean' },
  'strict-secrets': { type: 'boolean' },
  'allow-secrets': { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  limit: { type: 'string' },
  cursor: { type: 'string' },
  'show-passwords': { type: 'boolean' },
  'missing-ok': { type: 'boolean' },
  forget: { type: 'string' },
  probe: { type: 'boolean' },
  bucket: { type: 'string' },
  region: { type: 'string' },
  prefix: { type: 'string' },
  endpoint: { type: 'string' },
  'public-base-url': { type: 'string' },
  'force-path-style': { type: 'boolean' },
  'brand-name': { type: 'string' },
  force: { type: 'boolean' },
} as const;
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  publish: [
    'slug',
    'dir',
    'title',
    'password',
    'password-env',
    'password-file',
    'public',
    'no-encrypt',
    'overwrite',
    'no-store-password',
    'strict-secrets',
    'allow-secrets',
    'dry-run',
  ],
  list: ['dir', 'limit', 'cursor', 'show-passwords'],
  remove: ['dir', 'dry-run', 'missing-ok'],
  receipts: ['dir', 'show-passwords', 'forget', 'force', 'dry-run'],
  doctor: ['probe'],
  init: [
    'bucket',
    'region',
    'prefix',
    'endpoint',
    'public-base-url',
    'force-path-style',
    'brand-name',
    'force',
  ],
};
const GLOBAL = ['config', 'json', 'help', 'version'];
export type CommandName =
  | 'publish'
  | 'list'
  | 'remove'
  | 'receipts'
  | 'doctor'
  | 'init'
  | 'help'
  | 'version';
export interface ParsedArgs {
  readonly command: CommandName;
  readonly positionals: readonly string[];
  readonly json: boolean;
  text(name: keyof typeof OPTIONS): string | undefined;
  flag(name: keyof typeof OPTIONS): boolean;
}

export function wantsJson(argv: readonly string[]): boolean {
  // Relaxed tokens preserve option intent on errors without mistaking values or filenames for flags.
  const { tokens } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  return tokens.some((token) => token.kind === 'option' && token.name === 'json');
}
export function parseCli(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: OPTIONS,
      strict: true,
      allowPositionals: true,
      tokens: true,
    });
  } catch {
    throw new ExhibitError('E_USAGE', 'Invalid command-line options.', {
      hint: 'Run exhibit --help. Use -- before a filename that begins with a dash.',
    });
  }
  const { values, positionals } = parsed;
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name))
      throw new ExhibitError('E_USAGE', 'Repeated command-line options are not allowed.');
    seen.add(token.name);
  }
  const text = (name: keyof typeof OPTIONS) =>
    typeof values[name] === 'string' ? (values[name] as string) : undefined;
  const flag = (name: keyof typeof OPTIONS) => values[name] === true;
  const name = positionals[0] === 'rm' ? 'remove' : positionals[0];
  if (name !== undefined && !Object.hasOwn(ALLOWED, name) && !['help', 'version'].includes(name))
    throw new ExhibitError('E_USAGE', 'Unknown or missing command.');
  if (flag('help') && flag('version'))
    throw new ExhibitError('E_USAGE', 'Choose either help or version.');
  const command =
    flag('help') || name === 'help' || argv.length === 0
      ? 'help'
      : flag('version')
        ? 'version'
        : name;
  if (!command || (!Object.hasOwn(ALLOWED, command) && !['help', 'version'].includes(command))) {
    throw new ExhibitError('E_USAGE', 'Unknown or missing command.');
  }
  for (const key of Object.keys(values)) {
    if (!GLOBAL.includes(key) && !ALLOWED[name ?? command]?.includes(key))
      throw new ExhibitError('E_USAGE', 'An option is not valid for this command.');
  }
  const expected =
    name === undefined ? 0 : ['publish', 'remove', 'receipts', 'help'].includes(name) ? 2 : 1;
  const informational = ['help', 'version'].includes(command);
  if (positionals.length > expected || (!informational && positionals.length !== expected))
    throw new ExhibitError('E_USAGE', 'Incorrect number of arguments for this command.');
  const topic = positionals[1];
  if (
    name === 'help' &&
    topic !== undefined &&
    !Object.hasOwn(ALLOWED, topic) &&
    !['rm', 'help', 'version'].includes(topic)
  )
    throw new ExhibitError('E_USAGE', 'Unknown help topic.');
  return {
    command: command as CommandName,
    positionals: positionals.slice(1),
    json: flag('json'),
    text,
    flag,
  };
}
