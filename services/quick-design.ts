import type { DesignBrief } from '../types/design-brief';
import type { QuickBundle, StudioState, AssetKind, DesignPlan, DesignReview, StudioReview } from '../types/studio';
import type { BriefFieldSources } from '../lib/brief-field-sources';

/** Keep factual fields from the uploaded document; creative suggestions remain usable. */
export function groundedBrief(brief: DesignBrief, sources: BriefFieldSources): DesignBrief {
  const next = structuredClone(brief);
  for (const key of ['coreSellingPoints', 'keyIngredients', 'efficacy', 'priceBand', 'usageScenarios', 'texture'] as const) {
    if (sources[`product.${key}`] === 'ai') Object.assign(next.product, { [key]: Array.isArray(next.product[key]) ? [] : '' });
  }
  return next;
}
export type QuickDesignDependencies = {
  plan: (pendingId?: string) => Promise<DesignPlan>;
  review: (stage: AssetKind, plan: DesignPlan, original: string, refs: string[], revised?: string, pendingId?: string, copyText?: string) => Promise<DesignReview>;
  copy: (brief: DesignBrief, hint: string) => Promise<QuickBundle['copy']>;
  image: (stage: AssetKind, prompt: string, refs: string[], pendingId?: string, phase?: 'generate' | 'repair') => Promise<string>;
  checkpoint: (patch: Partial<StudioState>) => void;
  active: () => boolean;
};
export async function designInputKey(brief: DesignBrief, state: StudioState) {
  const bytes = new TextEncoder().encode(JSON.stringify({ brief, styleHint: state.styleHint, reference: state.reference }));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function generateQuickDesign(brief: DesignBrief, state: StudioState, deps: QuickDesignDependencies): Promise<QuickBundle> {
  if (!brief.brand.name.trim() || !brief.product.name.trim()) throw new Error('请补充品牌名和产品名');
  const inputKey = await designInputKey(brief, state);
  if (state.direction && state.direction.inputKey !== inputKey) state = { ...state, draft: state.stage === 'sync' ? state.draft : {}, direction: undefined, reviews: {}, pending: undefined, creativePending: undefined };
  const draft = { ...state.draft };
  let direction = state.direction;
  const reviews = Object.fromEntries(Object.entries(state.reviews || {}).map(([key, value]) => [key, { ...value }])) as Partial<Record<AssetKind, StudioReview>>;
  const versions = [...state.versions];
  const structureReference = draft.container?.referenceImageUrl || (state.reference?.mode !== 'style' ? state.reference?.dataUrl : undefined);
  const styleReference = state.reference?.mode === 'style' ? state.reference.dataUrl : undefined;
  const checkpoint = (stage: string, patch: Partial<StudioState> = {}) => { if (!deps.active()) throw new Error('已离开当前项目，已完成结果保留'); deps.checkpoint({ draft: { ...draft }, direction, reviews: structuredClone(reviews), versions: [...versions], stage, error: undefined, ...patch }); };
  const remember = (kind: AssetKind, imageUrl: string, instruction: string) => {
    if (!versions.some(v => v.kind === kind && v.imageUrl === imageUrl)) versions.push({ id: crypto.randomUUID(), kind, imageUrl, instruction, createdAt: new Date().toISOString() });
  };
  if (!direction) {
    checkpoint('plan');
    const plan = await deps.plan(state.creativePending?.step === 'plan' ? state.creativePending.jobId : undefined);
    direction = { inputKey, plan };
    checkpoint('plan', { creativePending: undefined });
  }
  const plan = direction.plan;
  const facts = `品牌：${brief.brand.name}。产品：${brief.product.name}。资料：${JSON.stringify(brief)}。设计方向：${state.styleHint || brief.styleKeywords.join('、') || '根据产品定位自主设计'}。整套视觉方案（Logo、内包装、外包装共用）：${JSON.stringify(plan)}。方案中的材质、结构和工艺是设计建议，不能覆盖文档中的事实和约束。遵守文档中提供的容量、尺寸和成本约束；未提供的结构尺寸、材质和工艺可作设计建议，不能作为已确认规格印在包装上。严禁编造净含量、功效、认证、配方、联系方式、二维码或条码。品牌名、产品名必须准确。`;
  const image = async (stage: AssetKind, prompt: string, refs: string[]) => {
    let review = reviews[stage];
    if (!review) {
      checkpoint(stage);
      const original = await deps.image(stage, prompt, refs, state.pending?.stage === stage && state.pending.phase !== 'repair' ? state.pending.jobId : undefined, 'generate');
      review = reviews[stage] = { original, status: 'reviewing' };
      remember(stage, original, '一键生成原图');
      checkpoint(`review:${stage}`, { pending: undefined });
    }
    const runReview = async (revised?: string) => {
      const step = `${revised ? 'compare' : 'review'}:${stage}` as const;
      checkpoint(step);
      const result = await deps.review(stage, plan, review!.original, refs, revised, state.creativePending?.step === step ? state.creativePending.jobId : undefined, draft.copy?.fields.map(f => `${f.label}：${f.content}`).join('\n'));
      checkpoint(step, { creativePending: undefined });
      return result;
    };
    try {
      if (review.status === 'reviewing') {
        review.review = await runReview();
        review.status = review.review.issues.some(i => i.severity === 'major') ? 'repairing' : 'done';
        review.selected = 'original';
        checkpoint(`review:${stage}`);
      }
      if (review.status === 'repairing') {
        checkpoint(`repair:${stage}`);
        const fixes = review.review!.issues.filter(i => i.severity === 'major').map(i => `${i.location}：${i.problem}；修改方法：${i.fix}`).join('\n');
        const context = prompt.replace(/第一张|第二张|唯一参考图/g, word => word === '第一张' ? '本次第二张' : word === '第二张' ? '本次第三张' : '本次第二张参考图');
        const revised = await deps.image(stage, `第一张图是待修正原图，后面的图片为品牌/结构依据。针对以下可见问题进行一次修正，保留已正确的品牌文字、设计特点及其他部分，不另起一套设计：\n${fixes}\n继续遵守原任务的资料与布局约束（参考序号已对应本次输入）：\n${context}`, [review.original, ...refs], state.pending?.stage === stage && state.pending.phase === 'repair' ? state.pending.jobId : undefined, 'repair');
        review.revised = revised;
        review.status = 'comparing';
        remember(stage, revised, 'AI 审稿修正版');
        checkpoint(`compare:${stage}`, { pending: undefined });
      }
      if (review.status === 'comparing') {
        review.comparison = await runReview(review.revised);
        review.selected = review.comparison.preferred === 'revised' ? 'revised' : 'original';
        review.status = 'done';
        checkpoint(`compare:${stage}`);
      }
    } catch (e) {
      // Leaving the page keeps the pending job and current phase for the next visit.
      if (!deps.active()) throw e;
      review.warning = `${review.status === 'repairing' ? '自动修正' : '审稿'}未完成，已保留原图：${e instanceof Error ? e.message : '服务暂时不可用'}`;
      review.status = 'unavailable'; review.selected = 'original';
      checkpoint(stage, { pending: undefined, creativePending: undefined });
    }
    return review.selected === 'revised' && review.revised ? review.revised : review.original;
  };
  if (!draft.container) draft.container = {
    id: `${structureReference ? 'uploaded' : 'ai'}-studio-${Date.now()}`, name: structureReference ? '参考图产品器型' : 'AI 原创产品器型', sketchUrl: structureReference || '', referenceImageUrl: structureReference,
    suitableCategories: [brief.product.category], dispensingType: structureReference ? '保持参考图结构' : '根据产品取用场景设计', volumeOptions: [brief.hardConstraints.dimensions || '规格待确认'], costLevel: 2,
    materialOptions: [], viewMode: 'three_view', source: structureReference ? 'upload' : 'ai', kind: 'custom', isCustom: true, engineeringVerificationRequired: true,
  };
  if (!draft.copy) { checkpoint('copy'); draft.copy = await deps.copy(brief, `${state.styleHint}。视觉方向：${plan.concept}；信息层级：${plan.typography}。仅使用提供资料中的事实，缺失的功效、规格、配方不补造。`); checkpoint('copy'); }
  if (!draft.logo) {
    const url = await image('logo', `设计单一完整的品牌 Logo，品牌字标为“${brief.brand.name}”，可以搭配一个简洁图形，居中平面白底，无样机，无多方案拼接。${styleReference ? '参考图仅提供配色、材质氛围和视觉风格，不得照搬参考图中的商标或文字。' : ''}${facts}输出背景必须为纯白色 #FFFFFF，不得使用场景、道具、渐变或有色背景。`, styleReference ? [styleReference] : []);
    draft.logo = { id: `logo-ai-studio-${Date.now()}`, imageUrl: url, logoType: 'combination', styleTags: brief.styleKeywords, matchedSellingPoints: [], round: 1 }; checkpoint('logo');
  }
  const copyText = draft.copy.fields.map(f => `${f.label}：${f.content}`).join('\n');
  if (!draft.product) {
    const designDirection = structureReference
      ? '第一张参考图是必须保持结构、器型比例、瓶盖和开口方式的产品，重新设计其视觉。第二张是必须准确使用的品牌 Logo。'
      : `从零原创设计完整产品的瓶身形状、比例、瓶肩、瓶盖或泵头、开口与取用方式、材质、表面工艺和标签。根据产品品类、容量、定位与使用场景自主决定合理结构。${styleReference ? '第一张图仅作配色、材质氛围和视觉风格参考，不锁定其瓶型、轮廓或开口，不得照搬其中的商标或文字。第二张是必须准确使用的品牌 Logo。' : '唯一参考图是必须准确使用的品牌 Logo，仅供品牌标识使用，不是瓶身结构参考。'}`;
    const prompt = `设计产品内包装（瓶身、瓶盖及标签）。${designDirection}按实际版面合理安排以下文案，品牌和产品名清晰完整：\n${copyText}\n${facts}\n输出一张纯白色 #FFFFFF 背景的三视图：从左到右为同一产品的完整正面、完整侧面、完整背面，三者同尺度、同基线、不重叠、不裁切，留足间距。三个视图的瓶型、瓶盖、材质和品牌标志完全一致，侧面是准确90度、背面是准确180度视角。只有这三个正交视图，不要场景主图、透视样机、额外瓶子、外包装盒、道具、色块背景、渐变、视角标注或说明卡。`;
    const reference = structureReference || styleReference;
    const url = await image('product', prompt, [...(reference ? [reference] : []), draft.logo.imageUrl]);
    // Use the original design as its structure preview in the professional workflow.
    draft.container = { ...draft.container, viewMode: 'three_view', ...(!structureReference ? { sketchUrl: url } : {}) };
    draft.product = { id: `product-ai-studio-${Date.now()}`, imageUrl: url, styleDirection: state.styleHint || '品牌统一设计', containerType: { ...draft.container, volume: draft.container.volumeOptions[0] }, cmf: { colorScheme: [], material: '见设计图，生产前确认', finish: '见设计图，生产前确认' }, matchedSellingPoints: brief.product.coreSellingPoints.map(p => p.point), avoidedPainPoints: [], viewMode: 'three_view', copyApplied: draft.copy.fields, round: 1, renderMode: 'direct_ai', generationStatus: 'completed', generationPrompt: prompt, createdAt: new Date().toISOString() }; checkpoint('product');
  }
  if (!draft.packaging) {
    const prompt = `为产品设计配套外包装盒。第一张参考是已选产品设计，第二张是品牌Logo。保持同一套品牌配色、字体与图形，合理安排以下实际文案：\n${copyText}\n${facts}\n输出一张纯白色 #FFFFFF 背景的外包装三视图：从左到右为同一盒子的完整正面、完整侧面、完整背面，三者同尺度、同基线、不重叠、不裁切，留足间距。三个视图结构、比例和品牌设计一致，侧面是准确90度、背面是准确180度视角。只有这三个正交视图，不输出瓶身、场景主图、透视样机、额外盒子、道具、色块背景、渐变、视角标注或说明卡。`;
    const url = await image('packaging', prompt, [draft.product.imageUrl, draft.logo.imageUrl]);
    draft.packaging = { id: `packaging-ai-studio-${Date.now()}`, boxTypeId: 'ai-generated-package', previewImageUrl: url, faces: [{ face: 'front', elements: [{ type: 'logo', content: brief.brand.name, position: '顶部' }, { type: 'product_name', content: brief.product.name, position: '中央' }] }, { face: 'back', elements: draft.copy.fields.map(f => ({ type: 'decoration' as const, content: f.content, position: f.label })) }], palette: [], costEstimate: '生产前核算', round: 1, renderMode: 'direct_ai_preview', directionName: state.styleHint || '配套包装', generationPrompt: prompt, createdAt: new Date().toISOString() }; checkpoint('packaging');
  }
  checkpoint('completed');
  return draft as QuickBundle;
}
