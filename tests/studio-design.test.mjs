import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuickDesign, designInputKey } from '../services/quick-design.ts';
import { emptyDesignBrief } from '../types/design-brief.ts';
import { emptyStudioState } from '../types/studio.ts';
import { parseDesignPlan, parseDesignReview, validateCreativeRequest, runStudioCreativeTask } from '../lib/studio-art-direction.ts';

const plan = { concept:'植物曲线与几何秩序', referenceInsights:'按产品定位原创', palette:[{color:'#30493D',role:'品牌字标与瓶盖，约20%'}], typography:'品牌优先，说明文字分配侧背面', logo:'圆角几何字标', product:'圆肩磨砂瓶，瓶盖高度约为瓶身1/4', packaging:'盒面用同一曲线划分信息区域' };
const good = { summary:'品牌清晰、布局协调，未发现明显问题', issues:[] };
const bad = { summary:'瓶盖比例与方案明显不协调', issues:[{severity:'major',location:'瓶盖',problem:'瓶盖比瓶身高',fix:'缩短瓶盖，保留瓶身、标志及其他部分'}] };
function fixture() {
  const brief = emptyDesignBrief(); brief.brand.name = '岚镜'; brief.product.name = '精华油';
  const state = emptyStudioState();
  const copy = { id:'copy-fixture', directionName:'测试', fields:[{key:'main_slogan',label:'标语',content:'日常柔润'}],toneTags:[],sourceInsightIds:[],round:1 };
  const calls = [], checkpoints = [];
  const deps = {
    plan: async pending => { calls.push(['plan',pending]); return plan; },
    copy: async () => copy,
    image: async (kind, prompt, refs, pending, phase) => { calls.push(['image',kind,phase,pending,prompt,refs]); return `${kind}-${phase}`; },
    review: async (kind, direction, original, refs, revised, pending) => { calls.push(['review',kind,original,revised,pending]); return revised ? {...good,preferred:'revised'} : good; },
    checkpoint: patch => { Object.assign(state, structuredClone(patch)); checkpoints.push(structuredClone(state)); }, active: () => true,
  };
  return { brief, state, copy, deps, calls, checkpoints };
}
test('one saved direction guides all assets and is reused for another bundle without parsing or replanning', async () => {
  const f = fixture();
  await generateQuickDesign(f.brief,f.state,f.deps);
  assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);
  for(const call of f.calls.filter(c=>c[0]==='image')) assert.match(call[4],/植物曲线与几何秩序/);
  assert.deepEqual(f.calls.filter(c=>c[0]==='review').map(c=>c[1]),['logo','product','packaging']);
  const savedPlan = f.state.direction;
  await generateQuickDesign(f.brief,{...f.state,draft:{},reviews:{}},f.deps);
  assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);
  assert.deepEqual(f.state.direction,savedPlan);
});
test('changing the brief, style or reference invalidates the saved plan', async () => {
  for(const change of ['brief','style','reference']) {
    const f = fixture(); await generateQuickDesign(f.brief,f.state,f.deps);
    if(change==='brief') f.brief.brand.name='新品牌';
    if(change==='style') f.state.styleHint='几何色块';
    if(change==='reference') f.state.reference={name:'新参考',mode:'style',dataUrl:'new-ref'};
    await generateQuickDesign(f.brief,f.state,f.deps);
    assert.equal(f.calls.filter(c=>c[0]==='plan').length,2,change);
    assert.equal(f.calls.filter(c=>c[0]==='image').length,6,change);
  }
});
test('major issues trigger exactly one repair; comparison selects the source used by downstream assets', async () => {
  const f=fixture();
  f.deps.review=async(kind,_plan,original,refs,revised)=>revised?{...bad,preferred:'revised'}:kind==='product'?bad:good;
  const bundle=await generateQuickDesign(f.brief,f.state,f.deps);
  assert.equal(bundle.product.imageUrl,'product-repair');
  const repairs=f.calls.filter(c=>c[0]==='image'&&c[2]==='repair');
  assert.equal(repairs.length,1);assert.deepEqual(repairs[0][5],['product-generate','logo-generate']);
  assert.match(repairs[0][4],/缩短瓶盖/);assert.match(repairs[0][4],/high|三视图/);
  assert.deepEqual(f.calls.find(c=>c[0]==='image'&&c[1]==='packaging')[5],['product-repair','logo-generate']);
  assert.deepEqual(f.state.versions.filter(v=>v.kind==='product').map(v=>v.imageUrl),['product-generate','product-repair']);
  assert.equal(f.state.reviews.product.status,'done');
});
test('comparison can retain the original without deleting the rejected revision', async () => {
  const f=fixture();f.deps.review=async(kind,p,o,r,revised)=>revised?{...good,preferred:'original'}:kind==='logo'?bad:good;
  const bundle=await generateQuickDesign(f.brief,f.state,f.deps);
  assert.equal(bundle.logo.imageUrl,'logo-generate');
  assert.equal(f.state.reviews.logo.revised,'logo-repair');
  assert.equal(f.state.versions.filter(v=>v.kind==='logo').length,2);
});
test('minor issues do not spend an extra image generation', async () => {
  const f=fixture();f.deps.review=async()=>({...bad,issues:bad.issues.map(i=>({...i,severity:'minor'}))});
  await generateQuickDesign(f.brief,f.state,f.deps);
  assert.equal(f.calls.filter(c=>c[0]==='image').length,3);
});
test('review receives the adopted copy so creative slogans are not mistaken for invented facts', async () => {
  const f=fixture(), texts=[];
  f.deps.review=async(_kind,_plan,_original,_refs,_revised,_pending,copyText)=>{texts.push(copyText);return good};
  await generateQuickDesign(f.brief,f.state,f.deps);
  assert.deepEqual(texts,['标语：日常柔润','标语：日常柔润','标语：日常柔润']);
});
test('review and repair failures preserve originals, report incomplete review, and continue other assets', async () => {
  for(const phase of ['review','repair','compare']) {
    const f=fixture(), image=f.deps.image;
    f.deps.review=async(kind,p,o,r,revised)=>{
      if(kind!=='product') return good;
      if(phase==='review'||(phase==='compare'&&revised)) throw Error('synthetic outage');
      return bad;
    };
    f.deps.image=async(...args)=>{if(phase==='repair'&&args[4]==='repair')throw Error('synthetic image failure');return image(...args)};
    const bundle=await generateQuickDesign(f.brief,f.state,f.deps);
    assert.equal(bundle.product.imageUrl,'product-generate',phase);
    assert.ok(bundle.packaging);assert.equal(f.state.reviews.product.status,'unavailable');
    assert.match(f.state.reviews.product.warning,/保留原图/);
    assert.equal(f.state.pending,undefined);assert.equal(f.state.creativePending,undefined);
  }
});
test('refresh resumes a saved review job without generating the source image again', async () => {
  const f=fixture();let active=true;
  f.deps.active=()=>active;
  f.deps.review=async(kind)=>{f.state.creativePending={step:`review:${kind}`,jobId:'paid-review'};active=false;throw Error('left')};
  await assert.rejects(generateQuickDesign(f.brief,f.state,f.deps),/left/);
  assert.equal(f.state.reviews.logo.original,'logo-generate');
  const g=fixture();g.deps.checkpoint=f.deps.checkpoint;
  await generateQuickDesign(f.brief,f.state,g.deps);
  assert.deepEqual(g.calls.find(c=>c[0]==='review'),['review','logo','logo-generate',undefined,'paid-review']);
  assert.deepEqual(g.calls.filter(c=>c[0]==='image').map(c=>c[1]),['product','packaging']);
});
test('refresh resumes the saved repair job and does not reuse the original generation job', async () => {
  const f=fixture();let active=true;const image=f.deps.image;
  f.deps.active=()=>active;f.deps.review=async()=>bad;
  f.deps.image=async(...args)=>{if(args[4]==='repair'){f.state.pending={stage:args[0],phase:'repair',jobId:'paid-repair'};active=false;throw Error('left')}return image(...args)};
  await assert.rejects(generateQuickDesign(f.brief,f.state,f.deps),/left/);
  const g=fixture();g.deps.checkpoint=f.deps.checkpoint;
  await generateQuickDesign(f.brief,f.state,g.deps);
  const first=g.calls.find(c=>c[0]==='image');
  assert.deepEqual(first.slice(0,4),['image','logo','repair','paid-repair']);
  assert.equal(g.calls.filter(c=>c[0]==='image'&&c[1]==='logo').length,1);
});
test('refresh after repair compares the stored revision instead of repairing again', async () => {
  const f=fixture();let active=true;
  f.deps.active=()=>active;f.deps.review=async(kind,p,o,r,revised)=>{if(revised){f.state.creativePending={step:`compare:${kind}`,jobId:'saved-comparison'};active=false;throw Error('left')}return bad};
  await assert.rejects(generateQuickDesign(f.brief,f.state,f.deps),/left/);
  const g=fixture();g.deps.checkpoint=f.deps.checkpoint;
  await generateQuickDesign(f.brief,f.state,g.deps);
  assert.deepEqual(g.calls.find(c=>c[0]==='review'),['review','logo','logo-generate','logo-repair','saved-comparison']);
  assert.equal(g.calls.filter(c=>c[0]==='image'&&c[1]==='logo').length,0);
});
test('leaving during planning stops before copy and paid image generation', async () => {
  const f=fixture();let active=true;f.deps.active=()=>active;f.deps.plan=async()=>{active=false;return plan};
  await assert.rejects(generateQuickDesign(f.brief,f.state,f.deps),/离开/);
  assert.equal(f.calls.length,0);
});
test('request and response validation rejects remote images and ungrounded comparison choices while accepting optional plan fields', () => {
  const f=fixture();assert.deepEqual(parseDesignPlan(plan),plan);
  assert.equal(parseDesignPlan({...plan,typography:''}).typography,'');
  assert.throws(()=>parseDesignReview(good,true),/比较/);
  assert.throws(()=>parseDesignReview({...bad,issues:[{severity:'major',problem:'难看'}]}),/位置/);
  const request={action:'review',brief:f.brief,styleHint:'',kind:'logo',plan,original:'https://internal.test/image',references:[]};
  assert.throws(()=>validateCreativeRequest(request),/提供/);
  assert.throws(()=>validateCreativeRequest({...request,original:'data:image/png;base64,AAAA',references:Array(3).fill('data:image/png;base64,AAAA')}),/数量/);
});
test('real adapter includes labeled images, ignores reasoning, and bills the authenticated owner', async t => {
  const f=fixture(), old={url:process.env.MAIN_APP_URL,secret:process.env.MAIN_APP_SSO_CLIENT_SECRET},billing=[],calls=[];
  process.env.MAIN_APP_URL='https://billing.test';process.env.MAIN_APP_SSO_CLIENT_SECRET='synthetic';
  t.after(()=>{for(const[k,v]of Object.entries({MAIN_APP_URL:old.url,MAIN_APP_SSO_CLIENT_SECRET:old.secret}))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(String(url).startsWith('https://billing.test')){billing.push(JSON.parse(init.body));return Response.json({ok:true})}
    calls.push({url,init});return Response.json({candidates:[{content:{parts:[{thought:true,text:'not JSON'},{text:'```json\n'+JSON.stringify({...good,preferred:'original'})+'\n```'}]}}],usageMetadata:{promptTokenCount:40,candidatesTokenCount:60}});
  });
  const img='data:image/png;base64,AAAA';
  const result=await runStudioCreativeTask({action:'review',brief:f.brief,styleHint:'',kind:'product',plan,original:img,revised:img,references:[img]}, {apiKey:'synthetic-key',baseUrl:'https://api.openlux.ai/v1/',model:'gemini-3.7-flash'},'synthetic-owner');
  assert.equal(result.data.preferred,'original');assert.equal(calls[0].url,'https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'],'synthetic-key');
  const parts=JSON.parse(calls[0].init.body).contents[0].parts;
  assert.equal(parts.filter(p=>p.inlineData).length,3);
  assert.ok(parts.some(p=>p.text?.includes('待审原图 original')));
  assert.ok(parts.some(p=>p.text?.includes('修正版 revised')));
  assert.equal(billing[0].userId,'synthetic-owner');assert.deepEqual(billing.map(b=>b.action),['reserve','settle']);
});
