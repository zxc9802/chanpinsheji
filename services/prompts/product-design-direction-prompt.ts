import type { DesignBrief } from "@/types/design-brief";
import type { ContainerType } from "@/types/container";
import type { ProductStructureMode } from "@/types/product-design";
import { resolveProductInformationCompleteness } from "@/services/product-information-completeness";

export const productDesignDirectionSystemPrompt =
  "你是资深工业设计、包装视觉与商业产品摄影艺术总监。你负责规划差异明显、可以直接生图的概念设计方向。定稿 Logo 是唯一固定的视觉标识，必须忠实保留；除此之外，包装文字与字体版式均由你自由设计。只输出严格 JSON。";

export function buildProductDesignDirectionPrompt(params: {
  brief: DesignBrief;
  logoStyleTags: string[];
  fixedLogoReference: { id: string; name: string; dataUrl?: string };
  viewMode: "two_view" | "three_view";
  structureMode: ProductStructureMode;
  container?: ContainerType;
  requirement: string;
  count: number;
  referenceImageNames?: string[];
  referenceImages?: { id?: string; name?: string }[];
}) {
  const { brief, container } = params;
  const count = Math.max(1, Math.min(5, params.count));
  const completeness = resolveProductInformationCompleteness(brief, container);
  const refs = (params.referenceImages || []).map((item, index) => ({
    id: String(item.id || `ref-${index + 1}`),
    name: String(item.name || `参考图${index + 1}`),
  }));
  const hardStructure =
    params.structureMode === "reference"
      ? `${container?.name || "用户上传结构"}；轮廓、比例、封口、结构、使用方式与参考一致；规格 ${container?.volumeOptions.join("/") || brief.hardConstraints.dimensions || "按参考图"}；基础包材 ${container?.materialOptions.join("/") || "按参考图"}`
      : `依据“${brief.product.name} / ${brief.product.category}”设计合理、可生产的产品结构，不套用无关器型`;

  return `生成 ${count} 个可以直接用于生图的产品概念设计方向。

【固定硬约束】
- 器型与结构：${hardStructure}
- 视图：${params.viewMode === "two_view" ? "正面+背面，不生成侧面" : "正面+侧面+背面"}
- 定稿 Logo 参考：${params.fixedLogoReference.id}=${params.fixedLogoReference.name}。这是唯一固定视觉标识，每个方向都必须忠实复现其图形、字形、比例和组合关系，不得重画、改字、替换或省略。
- 最终是一张 9:16 完整概念图：上方 60% 为一张连续完整的商业场景，下方 40% 为独立结构展示区。仅允许水平分界，禁止左右分栏、斜切、拼贴、嵌套视窗或上下位置互换。
- 商业场景与结构展示中的产品必须是同一器型、同一 Logo、同一图形和配色系统。

【设计背景，仅用于理解产品，不是必须印在包装上的文案】
- 产品/品类：${brief.product.name} / ${brief.product.industry} / ${brief.product.category}
- 品牌定位与个性：${brief.brand.positioning}；${brief.brand.personality.join("、")}
- 目标人群：${brief.consumer.ageRange}；${brief.consumer.keywords.join("、")}
- 产品卖点、功效、成分与场景：${brief.product.coreSellingPoints.map((item) => item.point).join("；")}；${brief.product.efficacy.join("、")}；${brief.product.keyIngredients.join("、")}；${brief.product.usageScenarios}
- 用户设计要求：${params.requirement.trim() || "无额外要求"}

【视觉参考图】
${refs.length ? `${refs.map((item) => `${item.id}=${item.name}`).join("；")}。每个方向可选 0–3 张，只借鉴配色、材质、图形、光线或气质，不得照搬其中的 Logo、品牌或受版权保护图形。` : "没有用户视觉参考图，请独立创作。"}

【自由文字与创意要求】
1. 除定稿 Logo 外，包装上的所有可见文字、字体组合、内容数量、信息层级、字距、对齐、图文关系都由你自由设计；不读取或复述第 3 步文案。
2. 可把产品背景转译为简短、自然的概念性文字，不要求内容准确，但视觉信息架构必须完整。当前产品的信息完整度规则：${completeness.promptRule}
3. 禁止出现“背面信息、功效说明、成分说明、使用说明”等系统字段名，禁止把提示词、JSON、UI 或后台术语印在包装上。
4. 避免乱码式大段堆字、普通办公文档排版、所有文字同字号居中堆叠。最多两套字体体系，至少形成主标识、核心信息、辅助文字三级视觉层级，文字应与图形、色块、留白和材质自然融合。
5. 视觉风格完全开放，不默认极简、高端、克制、低饱和或留白。不同方向必须至少四项明显不同，差异维度包括配色、图形、字体、表面工艺、商业场景与视觉性格，不能只换颜色。
6. 水波、模特、浴室、透明材质按方向合理性决定，不做全局禁用；禁止廉价模板感、悬浮广告文案、水印和无关产品。
7. 每个方向的 promptZh 只描述最终设计，不得包含结构化 JSON 痕迹、系统字段解释或第 3 步文案。

严格返回：
{"directions":[{
  "name":"方向名",
  "summary":"可修改的设计概述",
  "creativeConcept":"核心创意概念",
  "visualPersonality":"视觉性格",
  "designRationale":"设计依据与取舍",
  "inspirationSources":[{"kind":"brief|logo|reference_image|user_requirement","label":"来源","usage":"如何转译"}],
  "surfaceCmf":{
    "colors":[{"name":"颜色名","hex":"#RRGGBB"}],
    "graphicLanguage":"图形语言",
    "typographyStyle":"自由文字的字体气质与层级",
    "printFinish":"基础包材上的表面工艺",
    "sceneDirection":"商业场景与光线",
    "composition":"固定9:16上下结构：上方60%单一商业场景，下方40%结构视图"
  },
  "typographySystem":{
    "fontPairing":"最多两套字体及角色",
    "hierarchy":{"brand":"Logo视觉等级","productName":"AI自由核心文字等级","slogan":"AI自由标语等级","supporting":"辅助文字等级","body":"少量说明文字的组织方式"},
    "alignment":"主对齐轴",
    "spacing":"字距、行距与段落节奏",
    "grid":"包装版面网格及结构避让",
    "graphicIntegration":"文字与图形、色块、材质纹理的结合方式"
  },
  "copyAdaptations":[],
  "referenceImageIds":["可选的用户视觉参考图ID"],
  "avoidMotifs":["本方向自己判断的禁用元素"],
  "colors":[{"name":"颜色名","hex":"#RRGGBB"}],
  "promptZh":"包含固定 Logo 强参考、自由文字系统、动态信息完整度规则、固定上下构图和最终视觉的完整中文生图提示词"
}]}`;
}
