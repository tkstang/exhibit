import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { ExhibitError } from '#core/errors';
import type { PublicationReceipt } from '#core/types';
import { inspectReceipts } from './receipts.js';
import type { ReceiptDependencies } from './receipts.js';

const receipt: PublicationReceipt = {
  schemaVersion: 1,
  slug: 'plan',
  bodySha256: 'a'.repeat(64),
  status: 'prepared',
  savedAt: '2026-09-18T00:00:00.000Z',
  url: 'https://example.test/plan.html',
  etag: null,
  password: 'private-receipt-fixture',
};

function fixture() {
  const reads: string[][] = [];
  const removals: string[][] = [];
  const listings: string[] = [];
  const dependencies: ReceiptDependencies = {
    state: {
      async read(slug, digest) {
        reads.push([slug, digest]);
        return receipt;
      },
      async remove(slug, digest) {
        removals.push([slug, digest]);
      },
    },
    async enumerate(slug) {
      listings.push(slug);
      return [receipt];
    },
  };
  return { dependencies, reads, removals, listings };
}

describe('receipt inspection', () => {
  it('uses the injected inventory, redacts by default, and reveals only on request', async () => {
    const f = fixture();
    const listing = await inspectReceipts(f.dependencies, 'plan');
    assert.equal(listing.remote_checked, false);
    assert.equal(JSON.stringify(listing).includes(receipt.password!), false);
    assert.deepEqual(listing.receipts, [
      {
        body_sha256: receipt.bodySha256,
        status: receipt.status,
        saved_at: receipt.savedAt,
        url: receipt.url,
        etag: null,
        has_password: true,
      },
    ]);
    const revealed = await inspectReceipts(f.dependencies, 'plan', { showPasswords: true });
    assert.equal(revealed.receipts?.[0]?.password, receipt.password);
    assert.equal(JSON.stringify(revealed.warnings).includes(receipt.password!), false);
    assert.deepEqual(f.listings, ['plan', 'plan']);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.removals, []);
  });

  it('previews and forgets the exact injected receipt without enumerating', async () => {
    const f = fixture();
    const preview = await inspectReceipts(f.dependencies, 'plan', {
      forget: receipt.bodySha256,
      dryRun: true,
    });
    assert.equal(preview.forgotten, false);
    assert.equal(preview.dry_run, true);
    assert.deepEqual(f.removals, []);
    const forgotten = await inspectReceipts(f.dependencies, 'plan', {
      forget: receipt.bodySha256,
      force: true,
    });
    assert.equal(forgotten.forgotten, true);
    assert.equal(forgotten.remote_checked, false);
    assert.equal(JSON.stringify(forgotten).includes(receipt.password!), false);
    assert.deepEqual(f.reads, [
      ['plan', receipt.bodySha256],
      ['plan', receipt.bodySha256],
    ]);
    assert.deepEqual(f.removals, [['plan', receipt.bodySha256]]);
    assert.deepEqual(f.listings, []);
  });

  it('retains the local warning when validation or lookup fails', async () => {
    for (const scenario of ['slug', 'digest', 'force', 'dryRun', 'showPasswords', 'missing']) {
      const f = fixture();
      f.dependencies.state.read = async () => null;
      const options =
        scenario === 'digest'
          ? { forget: '../private-digest', force: true }
          : scenario === 'force'
            ? { force: true }
            : scenario === 'dryRun'
              ? { dryRun: true }
              : scenario === 'showPasswords'
                ? { forget: receipt.bodySha256, force: true, showPasswords: true }
                : { forget: receipt.bodySha256, force: true };
      await assert.rejects(
        inspectReceipts(f.dependencies, scenario === 'slug' ? '../bad' : 'plan', options),
        (error: unknown) => {
          assert.ok(error instanceof ExhibitError);
          assert.deepEqual(
            error.warnings.map((warning) => warning.code),
            ['W_LOCAL_RECEIPTS'],
          );
          assert.equal(JSON.stringify(error).includes(receipt.password!), false);
          return true;
        },
      );
      assert.deepEqual(f.removals, []);
    }
  });

  for (const operation of ['enumerate', 'read', 'remove'] as const) {
    for (const trusted of [true, false]) {
      it(`preserves warnings and redacts ${trusted ? 'domain' : 'unexpected'} ${operation} failures`, async () => {
        const f = fixture();
        const fail = async (): Promise<never> => {
          throw trusted
            ? new ExhibitError('E_STATE', 'Receipt operation failed.', {
                hint: 'Retry after repairing local state.',
                exitCode: 2,
                details: { retryable: false },
                warnings: [{ code: 'W_FIXTURE', message: 'Safe dependency warning.' }],
              })
            : Object.assign(new Error(receipt.password!), {
                warnings: [{ code: 'W_UNTRUSTED', message: receipt.password! }],
              });
        };
        if (operation === 'enumerate') f.dependencies.enumerate = fail;
        else f.dependencies.state[operation] = fail;
        await assert.rejects(
          inspectReceipts(
            f.dependencies,
            'plan',
            operation === 'enumerate'
              ? {}
              : {
                  forget: receipt.bodySha256,
                  force: true,
                },
          ),
          (error: unknown) => {
            assert.ok(error instanceof ExhibitError);
            assert.equal(error.code, trusted ? 'E_STATE' : 'E_UNEXPECTED');
            assert.equal(error.exitCode, 2);
            assert.deepEqual(
              error.warnings.map((warning) => warning.code),
              [
                'W_LOCAL_RECEIPTS',
                ...(operation === 'remove' ? ['W_FORGET_PASSWORD'] : []),
                ...(trusted ? ['W_FIXTURE'] : []),
              ],
            );
            if (trusted) {
              assert.equal(error.hint, 'Retry after repairing local state.');
              assert.deepEqual(error.details, { retryable: false });
            }
            assert.equal(JSON.stringify(error).includes(receipt.password!), false);
            return true;
          },
        );
      });
    }
  }
});
