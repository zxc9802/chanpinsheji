import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesignRegions, rectangleRegion, regionAtPoint, buildRegionEditPrompt } from '../lib/design-regions.ts';
import { compositePixels, transparentEditMask } from '../lib/region-pixels.ts';
import { generateQuickDesign, groundedBrief } from '../services/quick-design.ts';
import { emptyDesignBrief } from '../types/design-brief.ts';
import { emptyStudioState } from '../types/studio.ts';
import { validateRegionImage } from '../lib/region-recognition.ts';

const box = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
test('nested region selection chooses text over its containing package', () => {
  const regions = parseDesignRegions({regions:[{kind:'packaging',label:'盒子',polygon:box(10,10,900,900),confidence:.8},{kind:'text',label:'产品名',text:'夜修精华',polygon:box(50,50,200,70),confidence:.95}]});
  assert.equal(regionAtPoint(regions,[80,80]).text,'夜修精华');
  assert.equal(regionAtPoint(regions,[500,500]).kind,'packaging');
  assert.equal(regionAtPoint(regions,[999,999]),undefined);
});
test('invalid, degenerate and out of bounds polygons are rejected, never silently repaired', () => {
  assert.equal(parseDesignRegions({regions:[{kind:'text',polygon:[[0,0],[1001,1],[30,30],[10,10]]},{kind:'bottle',polygon:[[10,10],[10,10],[10,10]]},{kind:'unsupported',polygon:box(1,1,20,20)}]}).length,0);
  assert.throws(()=>parseDesignRegions({}),/有效/);
  assert.deepEqual(rectangleRegion([900,700],[10,20]).polygon,box(10,20,890,680));
  assert.equal(rectangleRegion([1,1],[2,2]),undefined);
});
test('regional compositing preserves every unselected RGBA byte including transparent pixels', () => {
  const original = new Uint8ClampedArray([12,34,56,0, 30,40,50,255, 99,98,97,255]);
  const edited = new Uint8ClampedArray([255,1,2,255, 3,4,5,255, 66,77,88,255]);
  const mask = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 255,255,255,0]);
  assert.deepEqual([...compositePixels(original,edited,mask)],[12,34,56,0,3,4,5,255,99,98,97,255]);
  assert.deepEqual([...transparentEditMask(mask)].filter((_,i)=>i%4===3),[255,0,255]);
  assert.throws(()=>compositePixels(original,edited,new Uint8ClampedArray(4)),/尺寸/);
});
test('explicit text replacement is quoted and empty instruction still yields an edit direction', () => {
  const prompt=buildRegionEditPrompt({region:{kind:'text',label:'产品名',text:'旧名称'},replacementText:'新名称 30mL',brandName:'青野',productName:'精华'});
  assert.match(prompt,/准确替换.*"新名称 30mL"/);
  assert.match(prompt,/不能编造/);
  assert.match(prompt,/第一张图是待编辑原图/);
});
test('recognition rejects remote URLs and unsupported media before network access', () => {
  assert.throws(()=>validateRegionImage('http://127.0.0.1/private'),/提供/);
  assert.throws(()=>validateRegionImage('data:image/svg+xml;base64,AAAA'),/提供/);
  assert.equal(validateRegionImage('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');
});
function fixture() {
  const brief=emptyDesignBrief(); brief.brand.name='青野'; brief.product.name='精华'; brief.product.category='护肤';
  const state=emptyStudioState();state.reference={name:'bottle.png',dataUrl:'data:image/png;base64,AAAA'};
  const copy={id:'copy-ai-test',directionName:'test',toneTags:[],fields:[{key:'main_slogan',label:'主标语',content:'自然相伴'}],sourceInsightIds:[],round:1};
  return {brief,state,copy};
}
test('legacy references keep their structure and all assets are checkpointed', async () => {
  const {brief,state,copy}=fixture(), images=[], checkpoints=[];
  const result=await generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage,prompt,refs,pending)=>{images.push({stage,prompt,refs,pending});return `data:image/png;base64,${stage}`;},checkpoint:p=>checkpoints.push(p),active:()=>true});
  assert.deepEqual(images.map(i=>i.stage),['logo','product','packaging']);
  assert.equal(images[1].refs[0],state.reference.dataUrl);assert.equal(images[1].refs[1],result.logo.imageUrl);
  assert.equal(images[2].refs[0],result.product.imageUrl);assert.equal(images[2].refs[1],result.logo.imageUrl);
  assert.match(images[1].prompt,/自然相伴/);assert.match(images[2].prompt,/自然相伴/);
  assert.match(images[1].prompt,/必须保持结构/);assert.equal(result.container.source,'upload');
  assert.equal(checkpoints.at(-1).stage,'completed');assert.ok(checkpoints.at(-1).draft.packaging);
});
test('document-only input creates an original structure with no user-supplied image', async () => {
  const {brief,state,copy}=fixture(), images=[];delete state.reference;
  brief.hardConstraints={dimensions:'30mL，瓶高不超过 110mm',maxPackageCost:'8元'};
  const result=await generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage,prompt,refs)=>{images.push({stage,prompt,refs});return `generated-${stage}`;},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(images.map(i=>i.refs),[[],['generated-logo'],['generated-product','generated-logo']]);
  assert.match(images[1].prompt,/从零原创.*瓶身形状.*瓶盖或泵头/);
  assert.match(images[1].prompt,/唯一参考图.*品牌 Logo/);
  assert.doesNotMatch(images[1].prompt,/必须保持结构/);
  assert.match(images[1].prompt,/30mL.*110mm/);assert.match(images[1].prompt,/8元/);
  assert.equal(result.container.source,'ai');assert.equal(result.container.referenceImageUrl,undefined);
  assert.equal(result.container.sketchUrl,result.product.imageUrl);
  assert.equal(result.product.containerType.sketchUrl,result.product.imageUrl);
  assert.equal(result.container.volumeOptions[0],brief.hardConstraints.dimensions);
});
test('optional style image informs logo and color without locking bottle structure', async () => {
  const {brief,state,copy}=fixture(), images=[];state.reference.mode='style';
  const result=await generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage,prompt,refs)=>{images.push({stage,prompt,refs});return `generated-${stage}`;},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(images[0].refs,[state.reference.dataUrl]);
  assert.deepEqual(images[1].refs,[state.reference.dataUrl,'generated-logo']);
  assert.match(images[1].prompt,/不锁定其瓶型/);assert.match(images[1].prompt,/从零原创/);
  assert.doesNotMatch(images[1].prompt,/必须保持结构/);
  assert.equal(result.container.source,'ai');assert.equal(result.container.referenceImageUrl,undefined);
  assert.equal(result.container.sketchUrl,'generated-product');
});
test('explicit preservation constrains structure without using the bottle as a logo style reference', async () => {
  const {brief,state,copy}=fixture(), images=[];state.reference.mode='structure';
  const result=await generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage,prompt,refs)=>{images.push({stage,prompt,refs});return `generated-${stage}`;},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(images[0].refs,[]);assert.deepEqual(images[1].refs,[state.reference.dataUrl,'generated-logo']);
  assert.match(images[1].prompt,/必须保持结构、器型比例、瓶盖和开口方式/);
  assert.equal(result.container.source,'upload');assert.equal(result.container.sketchUrl,state.reference.dataUrl);
});
test('document-only resume keeps its paid job and sync can preserve an adopted original bottle', async () => {
  const {brief,state,copy}=fixture();delete state.reference;
  let saved;
  await assert.rejects(generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage)=>{if(stage==='product')throw Error('waiting');return 'logo';},checkpoint:p=>{saved={...state,...p};},active:()=>true}),/waiting/);
  const calls=[];
  const result=await generateQuickDesign(brief,{...saved,pending:{stage:'product',jobId:'saved-original-job'}},{copy:async()=>{throw Error('duplicate copy');},image:async(stage,prompt,refs,pending)=>{calls.push({stage,refs,pending});return stage;},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(calls,[{stage:'product',refs:['logo'],pending:'saved-original-job'},{stage:'packaging',refs:['product','logo'],pending:undefined}]);
  const syncCalls=[];
  const synced=await generateQuickDesign(brief,{...state,draft:{logo:result.logo,copy,container:{...result.container,referenceImageUrl:'adopted-bottle'}}},{copy:async()=>{throw Error('duplicate copy');},image:async(stage,prompt,refs)=>{syncCalls.push({stage,prompt,refs});return `synced-${stage}`;},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(syncCalls[0].refs,['adopted-bottle','logo']);assert.match(syncCalls[0].prompt,/必须保持结构/);
  assert.deepEqual(syncCalls[1].refs,['synced-product','logo']);assert.equal(synced.container.source,'ai');
});
test('missing product identity still blocks generation before any AI calls', async () => {
  const {brief,state}=fixture();delete state.reference;brief.product.name=' ';
  await assert.rejects(generateQuickDesign(brief,state,{copy:async()=>{throw Error('unexpected call');},image:async()=>{throw Error('unexpected call');},checkpoint:()=>{},active:()=>true}),/请补充品牌名和产品名/);
});
test('resume uses saved job ID and never regenerates finished logo or copy', async () => {
  const {brief,state,copy}=fixture();state.draft={copy,logo:{id:'logo-ai-old',imageUrl:'saved-logo',styleTags:[],matchedSellingPoints:[],logoType:'wordmark',round:1}};state.pending={stage:'product',jobId:'existing-paid-job'};
  const calls=[];
  await generateQuickDesign(brief,state,{copy:async()=>{throw Error('must not regenerate copy');},image:async(stage,prompt,refs,pending)=>{calls.push([stage,pending]);return 'result';},checkpoint:()=>{},active:()=>true});
  assert.deepEqual(calls,[['product','existing-paid-job'],['packaging',undefined]]);
});
test('partial failure leaves finished assets available and does not continue to packaging', async () => {
  const {brief,state,copy}=fixture();let saved;const calls=[];
  await assert.rejects(generateQuickDesign(brief,state,{copy:async()=>copy,image:async(stage)=>{calls.push(stage);if(stage==='product')throw Error('provider timeout');return 'logo';},checkpoint:p=>{saved=p;},active:()=>true}),/provider timeout/);
  assert.deepEqual(calls,['logo','product']);assert.ok(saved.draft.logo);assert.ok(saved.draft.copy);assert.equal(saved.draft.packaging,undefined);
});
test('switching project stops the pipeline before another paid request', async () => {
  const {brief,state,copy}=fixture();let active=true,images=0;
  await assert.rejects(generateQuickDesign(brief,state,{copy:async()=>{active=false;return copy;},image:async()=>{images++;return 'image';},checkpoint:()=>{},active:()=>active}),/离开/);
  assert.equal(images,0);
});
test('one click discards AI invented product facts while preserving document facts', () => {
  const {brief}=fixture();brief.product.efficacy=['治愈'];brief.product.keyIngredients=['植物油'];brief.product.priceBand='999';
  const result=groundedBrief(brief,{'product.efficacy':'ai','product.keyIngredients':'document','product.priceBand':'ai'});
  assert.deepEqual(result.product.efficacy,[]);assert.deepEqual(result.product.keyIngredients,['植物油']);assert.equal(result.product.priceBand,'');assert.equal(brief.product.priceBand,'999');
});
