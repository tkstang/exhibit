import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, memory } from '#core/fixtures.test-support';
import { run } from './run.js';
import { diagnostics } from './output.js';
describe('CLI envelopes', () => {
  it('returns structured help and version without loading AWS', async () => { for(const argv of [['--help','--json'],['--version','--json']]) { const r=await run(argv); assert.equal(r.envelope.ok,true); assert.equal(r.exitCode,0); } });
  it('maps usage failures to a single stable error shape', async () => { const r=await run(['nonsense','--json']); assert.equal(r.envelope.ok,false); assert.equal(r.exitCode,1); if(!r.envelope.ok) assert.equal(r.envelope.error.code,'E_USAGE'); });
  it('redacts unexpected exception text', async () => { const r=await run(['list','--json'],{session:async()=>{throw new Error('secret-value-do-not-print');}}); assert.equal(r.exitCode,2); assert.equal(JSON.stringify(r).includes('secret-value-do-not-print'),false); });
  it('lists through an injected session and closes it', async () => { const m=memory(); let closed=false; const r=await run(['list','--json'],{session:async()=>({config,...m,close(){closed=true;}})}); assert.equal(r.envelope.ok,true); assert.equal(closed,true); });
  it('writes config but does not provision anything on init', async () => { let calls=0; const r=await run(['init','--bucket','my-exhibits','--region','us-east-1','--public-base-url','https://example.test','--json'],{initialize:async()=>{calls++;return config;}}); assert.equal(r.envelope.ok,true); assert.equal(calls,1); });
  it('diagnostics never stringify the result password', () => { assert.equal(diagnostics({schema_version:1,ok:true,command:'publish',data:{password:'secret-fixture',warnings:[{code:'W_SAMPLE',message:'safe warning'}]}}),'W_SAMPLE: safe warning\n'); });
});
