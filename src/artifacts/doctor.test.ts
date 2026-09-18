import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { config, memory } from '#core/fixtures.test-support';
import { SECURITY_HEADERS } from '#security/policy';
import { doctor, readResponseText } from './doctor.js';
import { createProtector } from '#security/staticrypt';

describe('deployment doctor', () => {
  it('is read-only without --probe', async () => { const {store,transport}=memory(); const r=await doctor(config,store); assert.equal(r.healthy,true); assert.equal(transport.writes.length,0); assert.equal(transport.deletes.length,0); assert.ok(r.checks.some(c=>c.status==='skipped')); });
  it('exercises encryption, public bytes, conditions, and cleanup', async () => {
    const {store,transport}=memory();
    const mockedFetch: typeof fetch=async()=>new Response(transport.writes[0]?.Body,{headers:{...SECURITY_HEADERS,'content-type':'text/html; charset=utf-8','content-disposition':'inline','cache-control':'no-store'}});
    const r=await doctor(config,store,{probe:true},{fetch:mockedFetch,protector:createProtector()});
    assert.equal(r.healthy,true,JSON.stringify(r)); assert.equal(transport.objects.size,0); assert.ok(r.checks.some(c=>c.name==='conditional-delete' && c.status==='pass'));
  });
  it('cleans up even when public retrieval fails', async () => {
    const {store,transport}=memory(); const mockedFetch: typeof fetch=async()=>new Response('not found',{status:404});
    const r=await doctor(config,store,{probe:true},{fetch:mockedFetch}); assert.equal(r.healthy,false); assert.equal(transport.objects.size,0);
  });
  it('limits remote probe response size', async () => { await assert.rejects(readResponseText(new Response('x'.repeat(100)),10),{code:'E_NETWORK'}); });
});
