import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as conceptsService from '../services/studio-concepts.ts';
import { emptyStudioState } from '../types/studio.ts';
import { emptyDesignBrief } from '../types/design-brief.ts';

// Render the real page at saved generation checkpoints, without browser APIs or paid requests.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/quick-design-studio.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function renderStudio(studio, { busy = '', kind = 'packaging', committed = studio.concepts?.find(c => c.state.stage === 'completed')?.state.draft } = {}) {
  const brief = emptyDesignBrief();
  const ctx = {
    brief, studio, hydrated: true, completedSteps: [1],
    logoProject: { candidates: committed?.logo ? [committed.logo] : [], finalLogoId: committed?.logo?.id },
    productDesign: { candidates: committed?.product ? [committed.product] : [], finalDesignId: committed?.product?.id },
    packagingProject: { finalDesign: committed?.packaging ? { candidate: committed.packaging } : undefined },
    copyProject: { finalPackage: committed?.copy },
  };
  const initialStates = [busy, '', kind];
  let stateIndex = 0;
  const imports = {
    react: { ...React, useState: initial => [stateIndex < initialStates.length ? initialStates[stateIndex++] : initial, () => {}], useEffect: () => {}, useRef: current => ({ current }) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    './design-brief-provider': { useDesignBrief: () => ctx },
    './studio-concept-preview': { StudioConceptPreview: ({ imageUrl, name }) => React.createElement('img', { src: imageUrl, alt: name }) },
    '@/services/studio-concepts': conceptsService,
    '@/lib/design-content': { hasBriefContent: () => true },
  };
  const exports = {};
  new Function('require', 'exports', compiled)(name => name === 'react/jsx-runtime' ? require(name) : imports[name] || {}, exports);
  return renderToStaticMarkup(exports.QuickDesignStudio());
}

function fixture() {
  const brief = emptyDesignBrief();
  brief.brand.name = '青野'; brief.product.name = '精华油';
  let state = emptyStudioState(), committed;
  const calls = [], checkpoints = [];
  const options = {
    active: () => true,
    save: next => { state = structuredClone(next); checkpoints.push(state); },
    completed: bundle => { committed = bundle; },
    dependencies: context => ({
      plan: async () => ({ concept: '植物几何', palette: [], typography: '中文品牌', logo: '字标', product: '瓶身', packaging: '纸盒' }),
      copy: async () => ({ id: 'copy', fields: [], toneTags: [], sourceInsightIds: [], round: 1 }),
      review: async () => ({ summary: '通过', issues: [] }),
      image: async (kind, prompt, refs) => { calls.push({ id: context.activeConceptId, kind, refs }); return `/test/${context.activeConceptId}-${kind}.png`; },
    }),
  };
  return { brief, get state() { return state; }, get committed() { return committed; }, calls, checkpoints, options };
}

test('completed suites become visible while the next suite is still generating, with packaging tabs usable', async () => {
  const f = fixture(), make = f.options.dependencies;
  let inspected = 0;
  f.options.dependencies = context => {
    const deps = make(context), plan = deps.plan;
    deps.plan = async () => {
      const index = context.concepts.findIndex(c => c.id === context.activeConceptId);
      if (index) {
        for (const kind of ['packaging', 'product']) {
          const html = renderStudio(f.state, { busy: '正在生成 3 个方案…', kind, committed: f.committed });
          const tabs = html.match(/<button[^>]*role="tab"[^>]*>.*?<\/button>/g) || [];
          assert.equal(tabs.length, 2);
          assert.ok(tabs.every(tab => !tab.includes('disabled')));
          for (const completed of context.concepts.slice(0, index)) assert.ok(html.includes(`/test/${completed.id}-${kind}.png`));
          assert.ok(!html.includes(`/test/${context.activeConceptId}-${kind}.png`));
          assert.match(html, new RegExp(`已完成 ${index}/3 套`));
          assert.doesNotMatch(html, /<img[^>]+-logo\.png/);
        }
        inspected++;
      }
      return plan();
    };
    return deps;
  };
  await conceptsService.generateStudioConcepts(f.brief, f.state, f.options);
  assert.equal(inspected, 2);
  for (const concept of f.state.concepts) {
    const logo = concept.state.draft.logo.imageUrl;
    assert.deepEqual(f.calls.find(c => c.id === concept.id && c.kind === 'product').refs, [logo]);
    assert.deepEqual(f.calls.find(c => c.id === concept.id && c.kind === 'packaging').refs, [concept.state.draft.product.imageUrl, logo]);
  }
});

test('completed gallery shows only inner and outer packaging, including restored partial progress', async () => {
  const f = fixture();
  await conceptsService.generateStudioConcepts(f.brief, f.state, f.options);
  const html = renderStudio(f.state);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.doesNotMatch(html, /Logo 可单独查看与修改|点击查看与修改 Logo/);
  for (const c of f.state.concepts) assert.ok(html.includes(c.state.draft.packaging.previewImageUrl));
  const partial = f.checkpoints.find(s => s.concepts[0].state.stage === 'completed' && s.concepts[1].state.stage === 'plan');
  const restored = renderStudio(JSON.parse(JSON.stringify(partial)));
  assert.ok(restored.includes(f.state.concepts[0].state.draft.packaging.previewImageUrl));
  assert.match(restored, /继续补齐 3 个方案/);
});

test('restart hides previously committed results until the new first suite completes', async () => {
  const f = fixture();
  await conceptsService.generateStudioConcepts(f.brief, f.state, f.options);
  const oldBundle = f.committed, make = f.options.dependencies;
  let checked = false;
  f.options.dependencies = context => {
    if (!checked) {
      const html = renderStudio(f.state, { busy: '正在生成 3 个方案…', committed: oldBundle });
      assert.ok(!html.includes(oldBundle.packaging.previewImageUrl));
      assert.doesNotMatch(html, /studio-concept-gallery/);
      checked = true;
    }
    return make(context);
  };
  await conceptsService.generateStudioConcepts(f.brief, f.state, { ...f.options, restart: true });
  assert.equal(checked, true);
});

test('legacy finalized assets stay visible without a complete studio draft', async () => {
  const f = fixture();
  await conceptsService.generateStudioConcepts(f.brief, f.state, f.options);
  const html = renderStudio(emptyStudioState(), { committed: f.committed });
  assert.ok(html.includes(f.committed.packaging.previewImageUrl));
  assert.match(html, /质检与交付/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
});
