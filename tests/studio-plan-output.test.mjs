import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesignPlan, runStudioCreativeTask } from '../lib/studio-art-direction.ts';
import { emptyDesignBrief } from '../types/design-brief.ts';

const plan = { concept:'白茶与柔润日常', referenceInsights:'根据身体乳资料原创', palette:[{color:'#FAF7F0',role:'瓶身主色'}], typography:'品牌优先，品名其次，使用说明放背面', logo:'圆润中文字标', product:'250mL 可锁定按压瓶', packaging:'同色折叠纸盒' };
function adapter(t, responses) {
  const calls=[], logs=[], billing=[];
  const oldUrl=process.env.MAIN_APP_URL, oldSecret=process.env.MAIN_APP_SSO_CLIENT_SECRET;
  process.env.MAIN_APP_URL='https://billing.test'; process.env.MAIN_APP_SSO_CLIENT_SECRET='synthetic';
  t.after(()=>{for(const [key,value] of Object.entries({MAIN_APP_URL:oldUrl,MAIN_APP_SSO_CLIENT_SECRET:oldSecret}))value===undefined?delete process.env[key]:process.env[key]=value});
  for(const method of ['warn','info']) t.mock.method(console,method,(...args)=>logs.push(args));
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(String(url).startsWith('https://billing.test')) {billing.push(JSON.parse(init.body));return Response.json({ok:true})}
    calls.push(JSON.parse(init.body));
    const response=responses[Math.min(calls.length-1,responses.length-1)];
    return Response.json({candidates:[{finishReason:response.finishReason || 'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:response.raw ?? JSON.stringify(response.plan)}]}}],usageMetadata:{promptTokenCount:40,candidatesTokenCount:60}});
  });
  const brief=emptyDesignBrief();brief.brand.name='沐屿';brief.product.name='白茶柔润身体乳';
  const run=()=>runStudioCreativeTask({action:'plan',brief,styleHint:''},{apiKey:'synthetic-private-key',baseUrl:'https://api.openlux.ai',model:'gemini-3.7-flash'},'test-owner','test-plan-job');
  return {run,calls,logs,billing};
}

test('structured typography retains labels and meaningful text instead of the reported validation failure',()=>{
  const typography={chinese:{font:'圆润黑体',weight:'品牌加粗'},hierarchy:['品名其次','说明放背面']};
  const value=parseDesignPlan({...plan,typography}).typography;
  assert.match(value,/chinese.*font.*圆润黑体/s);assert.match(value,/品牌加粗/);assert.match(value,/品名其次.*说明放背面/s);assert.doesNotMatch(value,/object Object/);
  assert.equal(parseDesignPlan({...plan,typography:['品牌加粗','品名其次']}).typography,'品牌加粗；品名其次');
});
test('missing optional descriptions are accepted and long useful content is preserved',()=>{
  for(const value of [undefined,null,'  ',{},false]) assert.equal(parseDesignPlan({...plan,typography:value}).typography,'');
  const long='字体说明'.repeat(1000);
  assert.equal(parseDesignPlan({typography:long}).typography,long);
  const partial=parseDesignPlan({logo:'无字图形',工艺:{瓶身:'细磨砂'}});
  assert.equal(partial.product,'');assert.deepEqual(partial.palette,[]);assert.match(partial.notes,/细磨砂/);
  assert.deepEqual(parseDesignPlan({palette:['乳白色',{color:'深绿'}]}).palette,[{color:'乳白色',role:''},{color:'深绿',role:''}]);
});
test('partial model output completes in one call without forcing missing fields',async t=>{
  const f=adapter(t,[{plan:{product:'磨砂玻璃瓶',typography:null}}]);
  const result=await f.run();assert.equal(result.data.product,'磨砂玻璃瓶');assert.equal(result.data.typography,'');
  assert.deepEqual(result.data.palette,[]);assert.equal(f.calls.length,1);
});
test('compatible nested plan requires no second paid call and logs only shape metadata',async t=>{
  const f=adapter(t,[{plan:{...plan,typography:{font:'private-design-text',hierarchy:['品牌大','品名小']}}}]);
  const result=await f.run();assert.match(result.data.typography,/private-design-text/);assert.equal(f.calls.length,1);
  const schema=f.calls[0].generationConfig.responseJsonSchema;
  assert.equal(schema.required,undefined);assert.equal(schema.properties.typography.type,'string');
  const logs=JSON.stringify(f.logs);assert.match(logs,/test-plan-job/);assert.match(logs,/object/);assert.doesNotMatch(logs,/private-design-text|private reasoning|synthetic-private-key|白茶柔润/);
});
test('one malformed model output is repaired within the same job and accounts for both text calls',async t=>{
  const f=adapter(t,[{plan:{}},{plan}]);
  const result=await f.run();assert.deepEqual(result.data,plan);assert.equal(f.calls.length,2);
  assert.equal(result.usage.tokens,200);assert.deepEqual(f.billing.map(x=>x.action),['reserve','settle','reserve','settle']);
  assert.equal(f.calls[1].contents.at(-1).role,'user');assert.match(f.calls[1].contents.at(-1).parts[0].text,/空内容/);
  assert.match(JSON.stringify(f.logs),/empty/);assert.ok(f.logs.every(args=>JSON.stringify(args).includes('test-plan-job')));
});
test('invalid JSON and length-limited outputs are retried once, never passed to image generation as an incomplete plan',async t=>{
  const f=adapter(t,[{raw:'{"typography":',finishReason:'MAX_TOKENS'},{plan}]);
  assert.deepEqual((await f.run()).data,plan);assert.equal(f.calls.length,2);
  assert.match(JSON.stringify(f.logs),/MAX_TOKENS/);assert.match(f.calls[1].contents.at(-1).parts[0].text,/精简/);
});
test('malformed JSON with a normal stop reason is repaired instead of leaking a JSON parser error',async t=>{
  const f=adapter(t,[{raw:'{"typography":'},{plan}]);
  assert.deepEqual((await f.run()).data,plan);assert.equal(f.calls.length,2);
  assert.match(JSON.stringify(f.logs),/invalid_json/);
});
test('repeated invalid plan fails clearly after two calls without a fabricated default or sensitive output',async t=>{
  const f=adapter(t,[{plan:{}}]);
  await assert.rejects(f.run(),error=>{assert.match(error.message,/模型输出.*空内容/);assert.match(error.message,/test-plan-job/);assert.doesNotMatch(error.message,/private-private/);return true});
  assert.equal(f.calls.length,2);assert.doesNotMatch(JSON.stringify(f.logs),/private-private/);
});
test('content blocked by the provider is not retried as a format repair',async t=>{
  const f=adapter(t,[{raw:'',finishReason:'SAFETY'}]);
  await assert.rejects(f.run(),/停止|未完成/);assert.equal(f.calls.length,1);
});
