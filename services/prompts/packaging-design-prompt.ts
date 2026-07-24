import type { DesignBrief } from "@/types/design-brief";
import type { BoxType } from "@/types/packaging";

export const packagingDesignPromptSystemPrompt =
  "你是资深消费品外包装设计与商业包装摄影艺术总监。你只设计外包装，不把产品本体当作外包装。根据真实结构参考图规划可直接用于图像模型的中文提示词。只输出严格 JSON，不输出解释。";

export function buildPackagingDesignPrompt(params: {
  brief: DesignBrief;
  boxType: BoxType;
  productCmf: { colorScheme: string[]; material: string; finish: string };
  logoImageUrl: string;
  mainSlogan?: string;
  requirement: string;
  count: number;
}) {
  const { brief, boxType } = params;
  const count = Math.max(1, Math.min(5, Number(params.count) || 1));
  const analysis = boxType.referenceAnalysis;
  const structureName = analysis?.structureName || boxType.name;
  const structureSummary = analysis?.structureSummary || boxType.description;
  const openingMethod = analysis?.openingMethod || "按上传参考图保持原有开合方式";
  const outlineRatio = analysis?.outlineRatio || "按上传参考图保持外轮廓比例";
  const viewMode = analysis?.viewMode === "two_view" ? "正面和背面" : "正面、侧面和背面";

  return `请生成 ${count} 条完整、可独立选择的外包装效果图中文生图提示词。

【真实图片输入顺序】
1. 用户上传的外包装结构参考图：这是唯一结构强约束，只锁定外包装的结构类型、轮廓、比例和开合方式。
2. 定稿 Logo 原图：锁定 Logo 的图形、字形、比例和组合关系。
没有产品概念图或产品本体图片输入。不得臆测存在第三张产品图片。

【不可编辑主体约束】
- 每个方向的 subjectType 必须严格等于 outer_package。
- 唯一主设计对象是“外包装”，不是茶包、面膜袋、瓶器、罐体、设备本体或其他产品本体。
- 已确认外包装结构：${structureName}。
- 结构摘要：${structureSummary}。
- 外轮廓比例：${outlineRatio}。
- 开合方式：${openingMethod}。
- 上方商业场景必须以完整外包装为视觉主角；产品本体最多作为小比例辅助道具。
- 下方结构展示区只允许出现同一外包装的${viewMode}，禁止产品本体进入该区域。

【项目依据】
- 品牌/产品：${brief.brand.name} / ${brief.product.name}
- 品类与行业：${brief.product.category} / ${brief.product.industry}
- 产品 CMF 文字协调参考：${params.productCmf.colorScheme.join("、")}；${params.productCmf.material}；${params.productCmf.finish}
- 注意：产品 CMF 只用于协调配色、材质与工艺，不得改变外包装结构，也不得把产品本体变成主角。
- 品牌定位与个性：${brief.brand.positioning}；${brief.brand.personality.join("、")}
- 核心卖点：${brief.product.coreSellingPoints.map((item) => item.point).join("；")}
- 主标语参考：${params.mainSlogan || brief.brand.slogan || "无"}
- 用户设计要求：${params.requirement.trim() || "无额外要求，请依据品牌与产品自由完成高质量概念设计"}

【固定展示形式】
- 一张 9:16 高质量外包装概念效果预览。
- 上方约 60%：一张连续完整的商业场景，外包装完整、清楚、占据视觉中心；产品最多作为不抢主体的小道具。
- 下方约 40%：干净背景上的外包装结构展示，只展示${viewMode}，等比例、同设计、完整不裁切。
- 两个区域中的外包装必须是同一结构、同一 Logo、同一配色和同一图形系统。
- 只允许上下水平分区；禁止左右分栏、斜切拼贴和嵌套小窗。

【禁止内容】
- 禁止将产品本体、茶包内袋、面膜内袋、瓶器或设备本体误画成外包装。
- 禁止产品本体出现在下方外包装结构展示区。
- 禁止刀版、展开图、CAD、尺寸线、裁切线、折线、出血线和印刷工程标注。
- 禁止灰色信息块、UI、提示词、JSON、设计说明、水印和系统字段名。
- 不要生成普通办公文档式排版或大段乱码；包装文字要形成自然的品牌层级和图文关系。

提示词需说明外包装主体、已确认结构、Logo 强参考、商业场景、结构视图、色彩、材质、工艺、图形语言、字体气质、灯光与成像质量。严格返回：
{"directions":[{"subjectType":"outer_package","structureSummary":"${structureSummary}","directionName":"简短且有辨识度的方向名称","designSummary":"一句话概括视觉差异","promptZh":"一条可直接用于图像生成模型的完整中文提示词"}]}

必须恰好返回 ${count} 个方向。各方向必须保持同一外包装结构和定稿 Logo，但在配色、图形语言、字体气质、材质工艺和商业场景中至少有三项明显不同。`;
}
