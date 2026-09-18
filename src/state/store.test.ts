import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'vitest';
import { config, date } from '#core/fixtures.test-support';
import { deploymentId } from '#core/identity';
import { createPublicationState } from './store.js';

describe('local password receipts', () => {
  it('keeps receipts for both revisions and reads only matching ciphertext identity', async () => {
    const root=await mkdtemp(join(tmpdir(),'exhibit-state-')); try {
      const state=createPublicationState(config,root); const a='a'.repeat(64); const b='b'.repeat(64);
      const base={schemaVersion:1 as const,slug:'plan',etag:null,url:'https://example.test/plan.html',status:'prepared' as const,savedAt:date};
      await state.save({...base,bodySha256:a,password:'first-fixture-password'});
      await state.save({...base,bodySha256:b,password:'second-fixture-password'});
      assert.equal((await state.read('plan',a))?.password,'first-fixture-password');
      assert.equal((await state.read('plan',b))?.password,'second-fixture-password');
      assert.equal(await state.read('plan','c'.repeat(64)),null);
      if(process.platform!=='win32') assert.equal((await stat(join(root,deploymentId(config),'plan',a+'.json'))).mode & 0o777,0o600);
      await state.remove('plan'); assert.equal(await state.read('plan',a),null);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it('rejects path traversal in state identities', async () => {
    const state=createPublicationState(config,'/unused'); await assert.rejects(state.read('../bad','a'.repeat(64))); await assert.rejects(state.read('plan','../bad'));
  });
});
