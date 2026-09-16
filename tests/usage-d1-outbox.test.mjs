import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createD1Outbox } from '../lib/usage-d1-outbox.ts';
import { createUsageReporter } from '../lib/openlux-usage.ts';

test('D1 persists failed reports and a new reporter drains them after restart', async () => {
  const sqlite=new DatabaseSync(':memory:');
  const database={prepare(sql) {let params=[]; return {bind(...values){params=values;return this;}, async run(){return sqlite.prepare(sql).run(...params);}, async all(){return {results:sqlite.prepare(sql).all(...params)};}};}};
  let online=false; const delivered=[];
  const options={tool:'chanpinsheji',getMainAppUrl:()=> 'https://main.test',secret:()=> 'test',getOutbox:async()=>createD1Outbox(database),fetchImpl:async(_url,init)=>{if(online) delivered.push(JSON.parse(init.body)); return Response.json({},{status:online?200:503});}};
  const first=createUsageReporter(options);
  const call=await first.begin({url:'https://api.openlux.ai/v1/images/generations',model:'img',userId:'employee'});
  await call.finish('completed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_monitor_outbox').get().n,2);
  online=true; await createUsageReporter(options).flush();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_monitor_outbox').get().n,0);
  assert.ok(delivered.every(event=>event.requestId===call.requestId && event.userId==='employee'));
  sqlite.close();
});
