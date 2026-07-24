import type {
  ProductCreativeStrategy,
  ProductDesignDirectionSnapshot,
  ProductDesignPromptDirection,
  ProductPresentationLayout,
  ProductTypographySystem,
} from "@/types/product-design";

/** 旧枚举仅用于读取历史方案；新方向统一进入开放创意模式。 */
export const productCreativeStrategies: ProductCreativeStrategy[] = [
  "open_creative",
  "editorial_minimal",
  "scientific_precision",
  "tactile_luxury",
  "signature_illustration",
  "contemporary_geometry",
];

export const productPresentationLayouts: ProductPresentationLayout[] = [
  "free_composition",
  "top_views_bottom_scene",
  "left_views_right_scene",
  "hero_top_views_bottom",
  "right_views_left_scene",
  "editorial_inset_views",
];

export const creativeStrategyLabels: Record<ProductCreativeStrategy, string> = {
  open_creative: "自由创意",
  editorial_minimal: "编辑极简",
  scientific_precision: "科学结构",
  tactile_luxury: "材质轻奢",
  signature_illustration: "识别性插画",
  contemporary_geometry: "当代几何",
};

export const presentationLayoutLabels: Record<ProductPresentationLayout, string> = {
  free_composition: "自由构图",
  top_views_bottom_scene: "上视图 · 下场景",
  left_views_right_scene: "左视图 · 右场景",
  hero_top_views_bottom: "上场景 · 下视图",
  right_views_left_scene: "右视图 · 左场景",
  editorial_inset_views: "场景主画面 · 视图嵌入",
};

export const fixedProductPresentationLayout: ProductPresentationLayout = "hero_top_views_bottom";

export function defaultTypographySystem(index = 0): ProductTypographySystem {
  return {
    fontPairing: `方向 ${index + 1} 独立选择不超过两套字体，并保持字体气质统一`,
    hierarchy: {
      brand: "一级识别：品牌标志清晰但不与品名争夺焦点",
      productName: "一级或二级信息：通过字号、字重或位置形成主要识别",
      slogan: "二级信息：与品名建立明显比例和节奏差异",
      supporting: "三级信息：短卖点少量呈现，不机械堆叠",
      body: "背面正文：采用可扫描的分组、网格和舒适行距",
    },
    alignment: "根据图形骨架选择单一主对齐轴，禁止全部机械居中堆叠",
    spacing: "通过字距、行距和段落间距建立至少三级阅读节奏",
    grid: "使用与包装结构匹配的版面网格，避开封口、折边和功能结构",
    graphicIntegration: "文字沿图形边界、色块或结构线自然组织，成为视觉系统的一部分",
  };
}

export function withFixedProductPresentation(
  snapshot: ProductDesignDirectionSnapshot,
): ProductDesignDirectionSnapshot {
  return {
    ...snapshot,
    presentationLayout: fixedProductPresentationLayout,
    surfaceCmf: {
      ...snapshot.surfaceCmf,
      composition: "固定 9:16 上下结构：上方 60% 单一商业场景，下方 40% 结构视图",
    },
  };
}

export function defaultDirectionSnapshot(index: number, referenceImageIds: string[] = []): ProductDesignDirectionSnapshot {
  return {
    creativeStrategy: "open_creative",
    presentationLayout: fixedProductPresentationLayout,
    creativeConcept: `开放创意方向 ${index + 1}`,
    visualPersonality: "依据当前产品重新推导，不预设极简或高端",
    designRationale: "保持器型、尺寸与产品事实，其余视觉要素开放设计",
    inspirationSources: [],
    surfaceCmf: {
      colors: [],
      graphicLanguage: "由本方向独立建立识别性图形语言",
      typographyStyle: "根据方向性格独立选择字体气质与层级",
      printFinish: "在基础包材上选择可落地的表面工艺",
      sceneDirection: "与产品用途相符且具有品牌识别的商业场景",
      composition: "固定 9:16 上下结构：上方 60% 单一商业场景，下方 40% 结构视图",
    },
    typographySystem: defaultTypographySystem(index),
    graphicLanguage: "由本方向独立建立识别性图形语言",
    informationLayout: "依据确认文案重新组织信息层级",
    materialStrategy: "保持基础包材，表面色彩与工艺开放",
    sceneDirection: "与产品用途相符的商业场景",
    avoidMotifs: [],
    referenceImageIds: referenceImageIds.slice(0, 3),
    copyAdaptations: [],
  };
}

export function snapshotFromDirection(direction: ProductDesignPromptDirection, index = 0): ProductDesignDirectionSnapshot {
  const fallback = defaultDirectionSnapshot(index, direction.referenceImageIds || []);
  const surfaceCmf = direction.surfaceCmf || {
    ...fallback.surfaceCmf,
    colors: direction.colors || [],
    graphicLanguage: direction.graphicLanguage || fallback.graphicLanguage,
    printFinish: direction.materialStrategy || fallback.materialStrategy,
    sceneDirection: direction.sceneDirection || fallback.sceneDirection,
  };
  return {
    creativeStrategy: direction.creativeStrategy || "open_creative",
    presentationLayout: fixedProductPresentationLayout,
    creativeConcept: direction.creativeConcept || direction.name || fallback.creativeConcept,
    visualPersonality: direction.visualPersonality || direction.summary || fallback.visualPersonality,
    designRationale: direction.designRationale || fallback.designRationale,
    inspirationSources: direction.inspirationSources || [],
    surfaceCmf: {
      ...surfaceCmf,
      composition: fallback.surfaceCmf.composition,
    },
    typographySystem: direction.typographySystem || fallback.typographySystem,
    graphicLanguage: direction.graphicLanguage || surfaceCmf.graphicLanguage,
    informationLayout: direction.informationLayout || "依据确认文案重新组织信息层级",
    materialStrategy: direction.materialStrategy || surfaceCmf.printFinish,
    sceneDirection: direction.sceneDirection || surfaceCmf.sceneDirection,
    avoidMotifs: direction.avoidMotifs || [],
    referenceImageIds: (direction.referenceImageIds || []).slice(0, 3),
    copyAdaptations: direction.copyAdaptations || [],
  };
}

export function nextDiverseSnapshot(
  source: ProductDesignDirectionSnapshot,
  availableReferenceIds: string[],
  retryHint = "",
): ProductDesignDirectionSnapshot {
  const unused = availableReferenceIds.filter((id) => !source.referenceImageIds.includes(id));
  const references = (unused.length ? unused : [...source.referenceImageIds].reverse()).slice(0, 3);
  const stamp = Date.now().toString(36).slice(-4);
  return {
    ...source,
    creativeStrategy: "open_creative",
    presentationLayout: fixedProductPresentationLayout,
    creativeConcept: `差异化重生 ${stamp}`,
    visualPersonality: `与原方案明显不同的视觉性格${retryHint ? `；重点修正：${retryHint}` : ""}`,
    designRationale: "保持结构与事实不变，重新选择配色、图形、字体、工艺、场景和构图",
    graphicLanguage: `重新建立不沿用原方案的识别图形语言 ${stamp}`,
    informationLayout: "重新组织字号、层级、密度与阅读节奏",
    materialStrategy: "基础包材不变，重新设计表面色彩、图案与可落地工艺",
    sceneDirection: `选择与原方案不同的真实使用场景和光线 ${stamp}`,
    surfaceCmf: {
      ...source.surfaceCmf,
      graphicLanguage: `重新建立不沿用原方案的识别图形语言 ${stamp}`,
      typographyStyle: "更换字体气质、字重与信息层级",
      printFinish: "在相同基础包材上更换表面工艺组合",
      sceneDirection: `选择与原方案不同的真实使用场景和光线 ${stamp}`,
      composition: "固定 9:16 上下结构：上方 60% 单一商业场景，下方 40% 结构视图",
    },
    typographySystem: {
      ...source.typographySystem,
      fontPairing: `更换字体组合与字形气质 ${stamp}`,
      hierarchy: {
        ...source.typographySystem.hierarchy,
        brand: "重新定义品牌标志的尺度与位置",
        productName: "重新定义品名的主次关系和视觉焦点",
        slogan: "使用与原方案不同的字号、字重和节奏",
        supporting: "短卖点重组为更清晰的三级信息",
        body: "背面使用新的网格分组和行距系统",
      },
      alignment: "更换主对齐轴，但保持单一、清晰且不机械居中",
      spacing: "重新设计字距、行距和段落留白节奏",
      graphicIntegration: `让文字与新图形语言形成不同的穿插、沿边或色块关系 ${stamp}`,
    },
    referenceImageIds: references,
  };
}

export function directionDifferenceCount(a: ProductDesignDirectionSnapshot, b: ProductDesignDirectionSnapshot) {
  return [
    a.creativeConcept !== b.creativeConcept,
    a.visualPersonality !== b.visualPersonality,
    a.surfaceCmf.colors.map((item) => item.hex).join() !== b.surfaceCmf.colors.map((item) => item.hex).join(),
    a.surfaceCmf.graphicLanguage !== b.surfaceCmf.graphicLanguage,
    a.surfaceCmf.typographyStyle !== b.surfaceCmf.typographyStyle ||
      a.typographySystem.fontPairing !== b.typographySystem.fontPairing ||
      a.typographySystem.alignment !== b.typographySystem.alignment,
    a.surfaceCmf.printFinish !== b.surfaceCmf.printFinish,
    a.surfaceCmf.sceneDirection !== b.surfaceCmf.sceneDirection,
  ].filter(Boolean).length;
}

export function hasLiteralWaterMotif() {
  // 新方向不再全局禁止或限额水波/水滴，由方向合理性与异步质量检查判断。
  return false;
}
