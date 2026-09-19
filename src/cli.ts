#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Writable } from 'node:stream';

import { run } from '#commands/run';
import { diagnostics, humanOutput } from '#commands/output';

async function writeOutput(stream: Writable, text: string): Promise<boolean> {
  if (!text) return true;
  let onError: () => void = () => {};
  try {
    return await new Promise<boolean>((resolve) => {
      onError = () => resolve(false);
      stream.once('error', onError);
      try {
        stream.write(text, (error) => resolve(!error));
      } catch {
        resolve(false);
      }
    });
  } finally {
    stream.off('error', onError);
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  output: { stdout: Writable; stderr: Writable } = process,
): Promise<void> {
  try {
    const { envelope, exitCode, json } = await run(argv);
    const written = await writeOutput(
      json || envelope.ok ? output.stdout : output.stderr,
      json ? `${JSON.stringify(envelope)}\n` : humanOutput(envelope),
    );
    await writeOutput(output.stderr, diagnostics(envelope));
    if (written) {
      process.exitCode = exitCode;
      return;
    }
  } catch {
    // This boundary includes output serialization and stream errors, never raw Node stacks.
  }
  process.exitCode = 2;
  await writeOutput(
    output.stderr,
    'E_UNEXPECTED: Could not deliver command output. The operation may have completed. Check local receipts; passwords not stored locally cannot be recovered.\n',
  );
}

function isEntrypoint(): boolean {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1]!) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
if (isEntrypoint()) await main();
