#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { run } from '#commands/run';
import { diagnostics, humanOutput } from '#commands/output';
import { wantsJson } from '#commands/parse';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { envelope, exitCode } = await run(argv);
  const json = wantsJson(argv);
  if (json) process.stdout.write(`${JSON.stringify(envelope)}\n`);
  else if (envelope.ok) process.stdout.write(humanOutput(envelope));
  else process.stderr.write(humanOutput(envelope));
  process.stderr.write(diagnostics(envelope));
  process.exitCode = exitCode;
}

function isEntrypoint(): boolean {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]!) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isEntrypoint()) await main();
