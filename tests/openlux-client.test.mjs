import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fetchAiJson, fetchAiForm } from '../lib/server-ai-client.ts';

test('actual image retries report separately and suppress only legacy OpenLux usage', async () => {
  const dir=await mkdtemp(join(tmpdir(),'design-usage-'));
  const oldFetch=globalThis.fetch, oldEnv={...process.env};
  const events=[], bills=[]; let attempts=0;
  Object.assign(process.env,{USAGE_MONITOR_INTERNAL_SECRET:'test',USAGE_MONITOR_OUTBOX_DIR:dir,MAIN_APP_URL:'https://main.test',MAIN_APP_SSO_CLIENT_SECRET:'test'});
  globalThis.fetch=async (url,init)=> {
    if(String(url).endsWith('/api/sso/usage')) {events.push(JSON.parse(init.body)); return Response.json({ok:true});}
    if(String(url).endsWith('/api/sso/billing')) {bills.push(JSON.parse(init.body)); return Response.json({ok:true});}
    attempts++; return attempts===1 ? Response.json({error:{message:'retry'}},{status:503}) : Response.json({data:[{b64_json:'private-image'}],usage:{input_tokens:12,output_tokens:0,input_tokens_details:{image_tokens:9}}});
  };
  try {
    const result=await fetchAiJson({url:'https://api.openlux.ai/v1/images/generations',apiKey:'private-key',body:{model:'image-model',prompt:'private'},timeoutMs:10000,provider:'yunwu',generator:'image',billingUserId:'verified-employee'});
    assert.equal(result.usage.provider,'api.openlux.ai');
    const terminal=events.filter(e=>e.status!=='pending');
    assert.deepEqual(terminal.map(e=>e.status),['failed','completed']);
    assert.notEqual(terminal[0].requestId,terminal[1].requestId);
    assert.equal(terminal[1].imageInputTokens,9);
    assert.ok(bills.every(b=>b.usageReportedSeparately===true && b.userId==='verified-employee'));
    events.length=0; bills.length=0;
    const form=new FormData(); form.set('model','edit-model');
    await fetchAiForm({url:'https://yunwu.ai/v1/images/edits',apiKey:'test',form,timeoutMs:10000,provider:'openlux',generator:'image-edit',billingUserId:'verified-employee'});
    assert.equal(events.length,0); assert.ok(bills.every(b=>!b.usageReportedSeparately && b.providerId==='yunwu.ai'));
  } finally {globalThis.fetch=oldFetch; process.env=oldEnv; await rm(dir,{recursive:true,force:true});}
});
