import test from 'node:test';
import assert from 'node:assert/strict';
import { importDesignBrief } from '../lib/import-design-brief.ts';
import { sourcesFromExtractedBrief, countFieldSources } from '../lib/brief-field-sources.ts';
import { hasBriefContent } from '../lib/design-content.ts';
import { validateCreativeRequest, parseDesignPlan } from '../lib/studio-art-direction.ts';
import { validatePackages } from '../lib/copy-packages.ts';
import { buildCopyGenerationPrompt } from '../services/prompts/copy-prompts.ts';
import { generateStudioConcepts, completeBundle } from '../services/studio-concepts.ts';
import { emptyStudioState } from '../types/studio.ts';

test('unnamed material-only documents retain custom details through persistence and planning', () => {
  const brief=importDesignBrief({projectId:'partial',product:{material:'细磨砂玻璃'},打样要求:{数量:200,工艺:['丝印','哑光']}});
  assert.equal(brief.brand.name,'');assert.equal(brief.product.name,'');
  assert.deepEqual(brief.product.keyIngredients,[]);assert.deepEqual(brief.product.efficacy,[]);
  assert.match(brief.additionalInfo,/细磨砂玻璃/);assert.match(brief.additionalInfo,/200.*丝印.*哑光/);
  assert.equal(hasBriefContent(brief),true);
  assert.equal(countFieldSources(sourcesFromExtractedBrief(brief)).extractedCount,1);
  assert.deepEqual(importDesignBrief(JSON.stringify(brief)),brief);
  assert.deepEqual(validateCreativeRequest({action:'plan',brief,styleHint:''}).brief,brief);
  assert.match(buildCopyGenerationPrompt({brief,allowPartial:true}),/细磨砂玻璃/);
});

test('category, constraints or a design idea alone can start planning without a fixed template', () => {
  for(const brief of [{product:{category:'身体乳'}},{hardConstraints:{dimensions:'高 10 cm'}}]) {
    const input=validateCreativeRequest({action:'plan',brief,styleHint:''});
    assert.equal(input.brief.brand.name,'');assert.ok(hasBriefContent(input.brief));
  }
  assert.equal(validateCreativeRequest({action:'plan',brief:{},styleHint:'自然圆润'}).styleHint,'自然圆润');
  const designHint='已有方案的有效描述'.repeat(1000);
  assert.equal(validateCreativeRequest({action:'plan',brief:{},styleHint:'圆润',designHint}).designHint,designHint);
  assert.equal(validateCreativeRequest({action:'review',brief:{},styleHint:'',kind:'logo',plan:{logo:'纯图形标志'},original:'data:image/png;base64,AAAA',references:[]}).kind,'logo');
  assert.throws(()=>validateCreativeRequest({action:'plan',brief:{projectId:'only-id'},styleHint:''}),/任意产品资料/);
  assert.throws(()=>parseDesignPlan({}),/空内容/);
  assert.throws(()=>parseDesignPlan({error:'Unauthorized'}),/停止/);
});

test('current-concept copy accepts partial or empty fields without inventing product facts', () => {
  const [copy]=validatePackages(JSON.stringify({packages:[{fields:[{key:'back_panel',content:'瓶身：细磨砂玻璃'}]}]}),[],['uncovered'],undefined,true);
  assert.equal(copy.fields.find(f=>f.key==='back_panel').content,'瓶身：细磨砂玻璃');
  assert.equal(copy.fields.find(f=>f.key==='ingredient_desc').content,'');
  const [empty]=validatePackages('{"packages":[{"fields":[]}]}',[],[],undefined,true);
  assert.ok(empty.fields.every(f=>f.content===''));
  assert.throws(()=>validatePackages('{"packages":[{"fields":[]}]}',[],[]),/三套文案/);
  assert.throws(()=>validatePackages('{"packages":[{}]}',[],[],undefined,true),/字段缺失/);
});

test('three full bundles can be generated from only custom notes and partial design plans', async () => {
  const brief=importDesignBrief({projectId:'notes-only',additionalInfo:'细磨砂瓶身，蓝绿色点缀'});
  const prompts=[],copy=validatePackages('{"packages":[{"fields":[]}]}',[],[],undefined,true)[0];
  let saved;
  const result=await generateStudioConcepts(brief,emptyStudioState(),{
    active:()=>true,save:s=>{saved=s},completed:()=>{},
    dependencies:()=>({
      plan:async()=>parseDesignPlan({product:'细磨砂瓶身',notes:'蓝绿色点缀'}),
      copy:async()=>copy,
      review:async()=>({summary:'合成检查通过',issues:[]}),
      image:async(kind,prompt)=>{prompts.push(prompt);return `${kind}-${prompts.length}`},
    }),
  });
  assert.equal(result.concepts.length,3);assert.equal(prompts.length,9);
  assert.ok(saved.concepts.every(c=>completeBundle(c.state.draft)));
  assert.ok(prompts.every(p=>p.includes('细磨砂')&&p.includes('#FFFFFF')));
  assert.ok(result.concepts.every(c=>c.state.direction.plan.typography===''));
  assert.deepEqual(result.concepts[0].state.draft.packaging.faces[0].elements,[]);
});
