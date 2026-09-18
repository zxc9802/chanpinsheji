import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudioConcepts, prepareStudioConcepts, selectStudioConcept, saveStudioConcept, completeBundle } from '../services/studio-concepts.ts';
import { emptyStudioState } from '../types/studio.ts';
import { emptyDesignBrief } from '../types/design-brief.ts';

function fixture() {
  const brief = emptyDesignBrief(); brief.brand.name = '沐屿'; brief.product.name = '白茶身体乳';
  let state = emptyStudioState();
  const calls = [], completed = [];
  const options = {
    active: () => true, save: next => { state = structuredClone(next); }, completed: bundle => completed.push(bundle),
    dependencies: (context, checkpoint) => {
      const id = context.activeConceptId;
      return {
        plan: async pending => { calls.push({id,kind:'plan',hint:context.styleHint,pending}); return {concept: `方向-${id}`, referenceInsights:'原创',palette:[{color:'#123456',role:'品牌色'}],typography:'主次分明',logo:'品牌字标',product:'瓶身',packaging:'外盒'}; },
        copy: async () => ({id:`copy-ai-${id}`,fields:[{key:'main_slogan',label:'标语',content:'柔润日常'}],toneTags:[],sourceInsightIds:[],round:1}),
        review: async () => ({summary:'未发现问题',issues:[]}),
        image: async (kind, prompt, refs, pending) => { calls.push({id,kind,prompt,refs,pending}); checkpoint({pending:{jobId:`job-${id}-${kind}`,stage:kind}}); return `${id}-${kind}`; },
      };
    },
  };
  return {brief, get state(){return state}, calls, completed, options};
}

test('three distinct directions generate three complete bundles with matching references', async () => {
  const f=fixture(); const result=await generateStudioConcepts(f.brief,f.state,f.options);
  assert.equal(result.concepts.length,3);
  assert.ok(result.concepts.every(c=>completeBundle(c.state.draft)&&c.state.stage==='completed'));
  assert.equal(f.calls.filter(c=>c.kind==='plan').length,3);
  assert.equal(f.calls.filter(c=>c.kind!=='plan').length,9);
  assert.equal(new Set(f.calls.filter(c=>c.kind==='plan').map(c=>c.hint)).size,3);
  for(const c of result.concepts) {
    assert.deepEqual(f.calls.find(x=>x.id===c.id&&x.kind==='product').refs,[`${c.id}-logo`]);
    assert.deepEqual(f.calls.find(x=>x.id===c.id&&x.kind==='packaging').refs,[`${c.id}-product`,`${c.id}-logo`]);
    assert.equal(c.state.versions.length,3);
  }
  for(const c of f.calls.filter(c=>['product','packaging'].includes(c.kind))) assert.match(c.prompt,/三个等宽竖列/);
  assert.equal(result.activeConceptId,result.concepts[0].id);
  assert.equal(f.state.pending,undefined);
});

test('failure in concept 2 resumes its paid job without regenerating concept 1', async () => {
  const f=fixture(), make=f.options.dependencies;let fail=true;
  f.options.dependencies=(context,checkpoint)=>{
    const deps=make(context,checkpoint), image=deps.image;
    deps.image=async(...args)=>{
      if(context.activeConceptId===context.concepts[1].id && args[0]==='product' && fail){checkpoint({pending:{stage:'product',jobId:'already-paid'}});throw Error('synthetic timeout')}
      return image(...args);
    };return deps;
  };
  await assert.rejects(generateStudioConcepts(f.brief,f.state,f.options),/timeout/);
  const saved=JSON.parse(JSON.stringify(f.state)), before=f.calls.length;
  assert.equal(saved.concepts[0].state.stage,'completed');
  assert.equal(saved.concepts[1].state.pending.jobId,'already-paid');
  fail=false;await generateStudioConcepts(f.brief,saved,f.options);
  const resumed=f.calls.slice(before);
  assert.equal(resumed.filter(c=>c.id===saved.concepts[0].id).length,0);
  assert.equal(resumed.find(c=>c.id===saved.concepts[1].id&&c.kind==='product').pending,'already-paid');
  assert.equal(resumed.filter(c=>c.id===saved.concepts[1].id&&['plan','logo'].includes(c.kind)).length,0);
  assert.ok(f.state.concepts.every(c=>c.state.stage==='completed'));
});

test('selection, edits, regions and version history stay within their own concept after persistence', async () => {
  const f=fixture(); await generateStudioConcepts(f.brief,f.state,f.options);
  const original=JSON.parse(JSON.stringify(f.state)), second=original.concepts[1].id;
  let edited=selectStudioConcept(original,second);
  edited=saveStudioConcept({...edited,draft:{...edited.draft,packaging:{...edited.draft.packaging,previewImageUrl:'edited-only-second'}},regions:{second:['region']},versions:[...edited.versions,{id:'edit',kind:'packaging',imageUrl:'edited-only-second'}]});
  const restored=selectStudioConcept(JSON.parse(JSON.stringify(edited)),original.concepts[0].id);
  assert.deepEqual(restored.draft,original.concepts[0].state.draft);
  assert.deepEqual(restored.regions,{});assert.equal(restored.versions.length,3);
  assert.deepEqual(restored.concepts[2],original.concepts[2]);
  const back=selectStudioConcept(restored,second);
  assert.equal(back.draft.packaging.previewImageUrl,'edited-only-second');
  assert.equal(back.versions.length,4);assert.deepEqual(back.regions,{second:['region']});
});

test('legacy single scheme is preserved when filling the remaining two', async () => {
  const f=fixture();const three=await generateStudioConcepts(f.brief,f.state,f.options);
  const legacy={...emptyStudioState(),...three.concepts[0].state},before=f.calls.length;
  const result=await generateStudioConcepts(f.brief,legacy,f.options);
  assert.deepEqual(result.concepts[0].state.draft,legacy.draft);
  assert.equal(f.calls.slice(before).filter(c=>c.kind==='plan').length,2);
  assert.equal(f.calls.slice(before).filter(c=>c.kind!=='plan').length,6);
});

test('syncing the selected scheme leaves both other schemes untouched', async () => {
  const f=fixture();await generateStudioConcepts(f.brief,f.state,f.options);
  const original=f.state, selected=selectStudioConcept(original,original.concepts[1].id);
  const initial={...selected,stage:'sync',draft:{logo:selected.draft.logo,copy:selected.draft.copy,container:{...selected.draft.container,referenceImageUrl:'adopted-product'}},reviews:{}};
  const before=f.calls.length;
  const result=await generateStudioConcepts(f.brief,initial,{...f.options,onlyCurrent:true});
  assert.deepEqual(result.concepts[0],original.concepts[0]);assert.deepEqual(result.concepts[2],original.concepts[2]);
  assert.deepEqual(f.calls.slice(before).map(c=>c.kind),['product','packaging']);
  assert.equal(f.calls.slice(before)[0].refs[0],'adopted-product');
});

test('restart creates nine new images and retains histories of all schemes', async () => {
  const f=fixture();await generateStudioConcepts(f.brief,f.state,f.options);
  const before=f.calls.length;
  await generateStudioConcepts(f.brief,selectStudioConcept(f.state,f.state.concepts[1].id),{...f.options,restart:true});
  assert.equal(f.calls.slice(before).filter(c=>c.kind!=='plan').length,9);
  assert.ok(f.state.concepts.every(c=>c.state.versions.length>=3));
});

test('project switch during planning stops before any image request', async () => {
  const f=fixture();let active=true;f.options.active=()=>active;const make=f.options.dependencies;
  f.options.dependencies=(context,checkpoint)=>{const deps=make(context,checkpoint),plan=deps.plan;deps.plan=async(...args)=>{const result=await plan(...args);active=false;return result};return deps};
  await assert.rejects(generateStudioConcepts(f.brief,f.state,f.options),/离开/);
  assert.equal(f.calls.filter(c=>c.kind!=='plan').length,0);
});
