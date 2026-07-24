import type { CopyGenerationParams, CopyField } from "@/types/copy";
import type { CopyRewriteParams } from "../copy-generator";

export const prohibitedAdvertisingTerms = ["最", "第一", "顶级", "极品", "国家级", "世界级", "唯一", "万能", "绝对", "百分百", "永久", "根治", "零风险", "无副作用"];
const schema = `{"packages":[{"directionName":"理性成分风","toneTags":["专业","克制","可信"],"sourceInsightIds":["insight-id"],"fields":[{"key":"main_slogan","label":"主标语","content":"不超过12个汉字","linkedInsightId":"可选且必须来自输入列表"},{"key":"sub_slogan","label":"副标语","content":"..."},{"key":"efficacy_desc","label":"功效说明","content":"..."},{"key":"ingredient_desc","label":"成分说明","content":"..."},{"key":"usage_desc","label":"使用说明","content":"..."},{"key":"back_panel","label":"背面信息","content":"..."}]}]}`;
export const copySystemPrompt = "你是资深消费品包装文案专家，擅长把品牌策略、产品证据和消费者洞察转化为合规、克制、可溯源的包装文案。你必须只输出严格 JSON，不要输出 Markdown。";
export function buildCopyGenerationPrompt({ brief, toneHint, baseCopyId }: CopyGenerationParams) {
  return `请为以下产品生成恰好 3 套差异显著的包装文案，方向固定为：1.理性成分风；2.情绪共鸣风；3.简洁高端风。

## Design Brief
品牌：${brief.brand.name}
品牌定位：${brief.brand.positioning}
品牌个性：${brief.brand.personality.join("、")}
品牌主张：${brief.brand.slogan}
目标人群：${brief.consumer.ageRange}；${brief.consumer.keywords.join("、")}
产品：${brief.product.name} / ${brief.product.industry} / ${brief.product.category}
核心卖点：${brief.product.coreSellingPoints.map((item) => `${item.point}${item.sourceInsightId ? ` [来源:${item.sourceInsightId}]` : ""}`).join("；")}
功效：${brief.product.efficacy.join("、")}
成分：${brief.product.keyIngredients.join("、")}
使用场景：${brief.product.usageScenarios}
质地：${brief.product.texture}
补充语气：${toneHint || "无"}
${baseCopyId ? `这是基于方案 ${baseCopyId} 的变体，请保持信息准确但明显改变表达。` : ""}

## 洞察（引用时 linkedInsightId 必须严格使用下列 id）
${brief.insights.length ? brief.insights.map((item) => `- id=${item.id}; type=${item.type}; frequency=${item.frequency}; content=${item.content}`).join("\n") : "无洞察数据"}

## 硬性约束
1. 每套必须包含六个字段：main_slogan、sub_slogan、efficacy_desc、ingredient_desc、usage_desc、back_panel。
2. main_slogan 不超过 12 个汉字；不得使用常见广告法风险词：${prohibitedAdvertisingTerms.join("、")}。
3. 所有 pain_point 必须至少被一条文案直接回应；回应文案填写对应 linkedInsightId。
4. sourceInsightIds 汇总本套实际引用的 insight id，不得虚构 id。
5. 三套文案措辞、句式和情绪必须显著不同，不能只替换近义词。
6. 功效表达基于输入，不作医疗承诺，不虚构实验数据。

严格按此 JSON 结构输出：${schema}`;
}
export function buildRewritePrompt({ field, instruction, brief }: CopyRewriteParams) {
  return `请重写一条包装文案，返回严格 JSON：{"alternatives":["版本1","版本2","版本3"]}。
原字段：${field.label} (${field.key})
原文：${field.content}
修改要求：${instruction}
品牌定位：${brief.brand.positioning}
品牌个性：${brief.brand.personality.join("、")}
产品：${brief.product.name}
卖点：${brief.product.coreSellingPoints.map((item) => item.point).join("、")}
要求：三个版本差异明显、信息准确、不使用${prohibitedAdvertisingTerms.join("、")}等风险词；若为主标语，每个版本不超过12个汉字。`;
}
