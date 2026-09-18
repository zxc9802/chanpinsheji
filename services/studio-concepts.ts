import { emptyStudioState, type StudioState, type StudioConceptState, type QuickBundle } from '../types/studio.ts';
import type { DesignBrief } from '../types/design-brief';
import { generateQuickDesign, type QuickDesignDependencies } from './quick-design.ts';

export function conceptSnapshot(state: StudioState): StudioConceptState {
  const { draft, stage, error, pending, direction, creativePending, reviews, edit, regions, versions } = state;
  return { draft, stage, error, pending, direction, creativePending, reviews, edit, regions, versions };
}

/** The top-level state is the working copy of the selected concept. */
export function saveStudioConcept(state: StudioState): StudioState {
  if (!state.activeConceptId || !state.concepts) return state;
  return { ...state, concepts: state.concepts.map(c => c.id === state.activeConceptId ? { ...c, state: conceptSnapshot(state) } : c) };
}

export function selectStudioConcept(state: StudioState, id: string): StudioState {
  const saved = saveStudioConcept(state), concept = saved.concepts?.find(c => c.id === id);
  return concept ? { ...saved, ...concept.state, activeConceptId: id } : saved;
}

export function completeBundle(draft: Partial<QuickBundle>): draft is QuickBundle {
  return !!(draft.logo && draft.copy && draft.container && draft.product && draft.packaging);
}

export function prepareStudioConcepts(state: StudioState): StudioState {
  if (state.concepts?.length === 3) return saveStudioConcept(state);
  const concepts = Array.from({ length: 3 }, (_, i) => ({
    id: crypto.randomUUID(), name: `方案 ${i + 1}`,
    state: conceptSnapshot(i === 0 ? state : emptyStudioState()),
  }));
  return { ...state, concepts, activeConceptId: concepts[0].id };
}

const approaches = [
  '以品牌字标与排版秩序为视觉核心，探索精确比例、留白与清晰信息层级。',
  '以独特的品牌图形符号为视觉核心，探索鲜明的图形构成与包装版式。',
  '以产品器型、材质触感及工艺细节为视觉核心，探索不同的结构或表面设计语言。',
];

export async function generateStudioConcepts(brief: DesignBrief, initial: StudioState, options: {
  active: () => boolean;
  save: (state: StudioState) => void;
  dependencies: (context: StudioState, checkpoint: QuickDesignDependencies['checkpoint']) => Omit<QuickDesignDependencies, 'checkpoint' | 'active'>;
  completed: (bundle: QuickBundle) => void;
  onlyCurrent?: boolean;
  restart?: boolean;
}): Promise<StudioState> {
  let state = prepareStudioConcepts(initial);
  if (options.restart) {
    const concepts = state.concepts!.map(c => ({ ...c, state: { ...conceptSnapshot(emptyStudioState()), versions: c.state.versions } }));
    state = { ...state, concepts, ...concepts.find(c => c.id === state.activeConceptId)!.state };
  }
  const selectedId = state.activeConceptId!;
  const publish = () => {
    if (!options.active()) throw new Error('已离开当前项目，已完成结果保留');
    state = saveStudioConcept(state); options.save(state);
  };
  // Keep independent job IDs, reviews, edits and history; resume only unfinished concepts.
  const ids = options.onlyCurrent ? [selectedId] : state.concepts!.map(c => c.id);
  for (const id of ids) {
    state = selectStudioConcept(state, id);
    const index = state.concepts!.findIndex(c => c.id === id);
    const concept = state.concepts![index];
    if (completeBundle(state.draft) && state.stage === 'completed') continue;
    if (!concept.designHint) {
      const prior = state.concepts!.slice(0, index).flatMap(c => c.state.direction ? [c.state.direction.plan.concept] : []);
      const designHint = `当前是三个独立候选设计中的${concept.name}。${approaches[index]}所有已知产品事实、用户设计想法、参考图用途和硬约束优先。与其他方案的标志构成、版式和设计语言明显区分，不能仅换颜色；保留器型模式不得改变参考瓶型。${prior.length ? `已有方案主题（请避免重复）：${prior.join('；')}` : ''}`;
      state = { ...state, concepts: state.concepts!.map(c => c.id === id ? { ...c, designHint } : c) };
    }
    publish();
    const checkpoint = (patch: Partial<StudioState>) => { state = { ...state, ...patch }; publish(); };
    const context = { ...state, styleHint: `${state.styleHint}\n${state.concepts![index].designHint}` };
    try {
      const bundle = await generateQuickDesign(brief, context, { ...options.dependencies(context, checkpoint), checkpoint, active: options.active });
      options.completed(bundle);
    } catch (e) {
      if (options.active()) checkpoint({ error: `${concept.name}：${e instanceof Error ? e.message : '生成失败'}` });
      throw e;
    }
  }
  // Return to the selected concept after all three have finished.
  state = selectStudioConcept(state, selectedId); publish();
  if (completeBundle(state.draft)) options.completed(state.draft);
  return state;
}
