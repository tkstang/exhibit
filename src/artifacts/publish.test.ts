import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, date, memory, object, s3Error } from '#core/fixtures.test-support';
import { ExhibitError } from '#core/errors';
import { publishArtifact } from './publish.js';
import type { PublishDependencies } from './publish.js';
function setup(text = 'Private source sentinel') {
  const m = memory();
  const deps: PublishDependencies = {
    config,
    ...m,
    read: async () => ({ text, type: 'markdown', title: 'Private title' }),
    render: async (input) => ({ html: `<h1>${input.text}</h1>`, warnings: [] }),
    protect: async () => '<html>opaque encrypted fixture</html>',
    publicView: async (html) => html,
    makeSlug: () => 'opaque-fixture',
    now: () => new Date(date),
  };
  return { ...m, deps };
}
describe('publication use case', () => {
  it('publishes new keys under HEAD-denied, prefix-list-authorized storage', async () => {
    const { deps, transport } = setup();
    transport.head = async () => {
      throw s3Error('AccessDenied', 403);
    };
    const result = await publishArtifact({ file: 'plan.md' }, deps);
    assert.equal(result.dry_run, false);
    assert.equal(transport.listCalls, 1);
    assert.equal(transport.writes[0]?.IfNoneMatch, '*');
  });
  it('still rejects a concurrent create after listing established absence', async () => {
    const { deps, transport, store, receipts } = setup();
    transport.head = async () => {
      throw s3Error('AccessDenied', 403);
    };
    const put = store.put.bind(store);
    store.put = async (input) => {
      await put(object(input.slug, 'concurrent object'));
      return put(input);
    };
    await assert.rejects(publishArtifact({ file: 'plan.md' }, deps), { code: 'E_CONFLICT' });
    assert.equal(transport.writes.length, 1);
    assert.equal([...receipts.values()][0]?.status, 'prepared');
  });
  it('defaults to protection and saves the key before upload', async () => {
    const { deps, transport, receipts } = setup();
    const result = await publishArtifact({ file: 'plan.md' }, deps);
    assert.equal(result.protected, true);
    assert.equal(transport.writes.length, 1);
    assert.equal(transport.writes[0]?.Body.includes('Private source sentinel'), false);
    assert.equal(receipts.size, 1);
    assert.equal([...receipts.values()][0]?.status, 'published');
    assert.equal('password' in result && typeof result.password, 'string');
  });
  it('requires explicit public mode and never emits a public password', async () => {
    const { deps } = setup();
    const result = await publishArtifact({ file: 'plan.md', public: true }, deps);
    assert.equal(result.protected, false);
    assert.ok('password' in result && result.password === null);
  });
  it('warns about protected secret matches without leaking them', async () => {
    const token = 'ghp_' + 'x'.repeat(30);
    const { deps } = setup(token);
    const r = await publishArtifact({ file: 'plan.md' }, deps);
    assert.ok(r.warnings.some((w) => w.code === 'W_SECRETS'));
    assert.equal(JSON.stringify(r).includes(token), false);
  });
  it('blocks public secret matches unless explicitly acknowledged', async () => {
    const { deps } = setup('ghp_' + 'x'.repeat(30));
    await assert.rejects(publishArtifact({ file: 'plan.md', public: true }, deps), {
      code: 'E_SECRET_DETECTED',
    });
    const r = await publishArtifact({ file: 'plan.md', public: true, allowSecrets: true }, deps);
    assert.equal(r.protected, false);
  });
  it('blocks protected matches in strict mode', async () => {
    const { deps } = setup('ghp_' + 'x'.repeat(30));
    await assert.rejects(publishArtifact({ file: 'plan.md', strictSecrets: true }, deps), {
      code: 'E_SECRET_DETECTED',
    });
  });
  it('refuses implicit overwrites', async () => {
    const { deps, store } = setup();
    await store.put(object('opaque-fixture'));
    await assert.rejects(publishArtifact({ file: 'plan.md' }, deps), { code: 'E_CONFLICT' });
  });
  it('uses conditional overwrite with an explicit slug', async () => {
    const { deps, store, transport } = setup();
    const old = await store.put(object('plan'));
    await publishArtifact({ file: 'plan.md', slug: 'plan', overwrite: true }, deps);
    assert.equal(transport.writes.at(-1)?.IfMatch, old.etag);
  });
  it('does not touch cloud/state in dry-run', async () => {
    const { deps, transport, receipts } = setup();
    const r = await publishArtifact({ file: 'plan.md', dryRun: true }, deps);
    assert.equal(r.dry_run, true);
    assert.equal(transport.writes.length, 0);
    assert.equal(transport.listCalls, 0);
    assert.equal(receipts.size, 0);
    assert.equal('password' in r, false);
  });
  it('retains a prepared receipt after an ambiguous upload failure', async () => {
    const { deps, receipts } = setup();
    deps.store.put = async () => {
      throw new ExhibitError('E_STORAGE', 'Fixture transport failure');
    };
    await assert.rejects(publishArtifact({ file: 'plan.md' }, deps));
    assert.equal([...receipts.values()][0]?.status, 'prepared');
  });
  it('fails before upload if a protected password cannot be persisted', async () => {
    const { deps, transport } = setup();
    deps.state.save = async () => {
      throw new ExhibitError('E_STATE', 'Fixture write error');
    };
    await assert.rejects(publishArtifact({ file: 'plan.md' }, deps), { code: 'E_STATE' });
    assert.equal(transport.writes.length, 0);
  });
  it('supports explicitly ephemeral passwords', async () => {
    const { deps, receipts } = setup();
    const r = await publishArtifact({ file: 'plan.md', noStorePassword: true }, deps);
    assert.equal(receipts.size, 0);
    assert.ok(r.warnings.some((w) => w.code === 'W_PASSWORD_NOT_STORED'));
  });
  it('rejects incompatible flags and short custom passwords', async () => {
    const { deps } = setup();
    await assert.rejects(
      publishArtifact({ file: 'plan.md', public: true, password: 'long-fixture-password' }, deps),
    );
    await assert.rejects(publishArtifact({ file: 'plan.md', password: 'short' }, deps));
    await assert.rejects(publishArtifact({ file: 'plan.md', overwrite: true }, deps));
  });
  it('scans source titles as well as body text without exposing matches', async () => {
    const { deps, transport } = setup();
    const token = 'ghp_' + 't'.repeat(30);
    const titled = {
      ...deps,
      read: async () => ({ text: 'ordinary body', type: 'markdown' as const, title: token }),
    };
    for (const options of [{ public: true }, { strictSecrets: true }]) {
      await assert.rejects(
        publishArtifact({ file: 'plan.md', ...options }, titled),
        (error: unknown) => {
          assert.ok(error instanceof ExhibitError);
          assert.equal(error.code, 'E_SECRET_DETECTED');
          assert.equal(JSON.stringify(error).includes(token), false);
          return true;
        },
      );
    }
    assert.equal(transport.writes.length, 0);
  });
  it('validates dry-run passwords and explicitly leaves remote state unchecked', async () => {
    const { deps, transport } = setup();
    await assert.rejects(
      publishArtifact({ file: 'plan.md', dryRun: true, password: 'short' }, deps),
      { code: 'E_PASSWORD' },
    );
    const result = await publishArtifact({ file: 'plan.md', dryRun: true }, deps);
    assert.ok('remote_checked' in result && result.remote_checked === false);
    assert.ok(result.warnings.some((warning) => warning.code === 'W_DRY_RUN_LOCAL'));
    assert.equal(transport.listCalls, 0);
  });
  it('never uploads or persists a password after encryption failure', async () => {
    const { deps, transport, receipts } = setup();
    await assert.rejects(
      publishArtifact(
        { file: 'plan.md' },
        {
          ...deps,
          protect: async () => {
            throw new ExhibitError('E_ENCRYPTION', 'Fixture failure');
          },
        },
      ),
      { code: 'E_ENCRYPTION' },
    );
    assert.equal(transport.writes.length, 0);
    assert.equal(receipts.size, 0);
  });
  it('retains safe secret warnings when a write may have succeeded', async () => {
    const token = 'ghp_' + 'x'.repeat(30);
    const { deps, receipts } = setup(token);
    deps.store.put = async () => {
      throw new ExhibitError('E_STORAGE', 'Fixture timeout', { exitCode: 2 });
    };
    await assert.rejects(publishArtifact({ file: 'plan.md' }, deps), (error: unknown) => {
      assert.ok(error instanceof ExhibitError);
      assert.equal(error.code, 'E_STORAGE');
      assert.equal(error.exitCode, 2);
      assert.ok(error.warnings.some((warning) => warning.code === 'W_SECRETS'));
      assert.equal(JSON.stringify(error).includes(token), false);
      return true;
    });
    assert.equal([...receipts.values()][0]?.status, 'prepared');
  });
});
