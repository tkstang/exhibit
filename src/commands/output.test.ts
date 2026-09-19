import assert from 'node:assert/strict';
import { it } from 'vitest';
import { humanOutput, diagnostics } from './output.js';

it('distinguishes unconfirmed removal from deletion, absence, and dry runs', () => {
  for (const [data, label] of [
    [{ removed: true, dry_run: false, warnings: [] }, 'Removed'],
    [{ removed: false, dry_run: false, warnings: [] }, 'Already absent'],
    [{ removed: false, dry_run: true, warnings: [] }, 'Would remove'],
    [
      {
        removed: false,
        dry_run: false,
        warnings: [{ code: 'W_DELETE_UNCONFIRMED', message: 'The local receipt was retained.' }],
      },
      'Removal unconfirmed',
    ],
  ] as const) {
    const envelope = {
      schema_version: 1,
      ok: true,
      command: 'remove',
      data: { slug: 'plan', ...data },
    } as const;
    assert.equal(humanOutput(envelope), `${label}: plan\n`);
    assert.equal(humanOutput(envelope).includes('W_DELETE_UNCONFIRMED'), false);
    if (label === 'Removal unconfirmed')
      assert.match(diagnostics(envelope), /W_DELETE_UNCONFIRMED/);
  }
});
