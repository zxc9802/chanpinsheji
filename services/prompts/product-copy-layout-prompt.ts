import type { DesignBrief } from "@/types/design-brief";
import type { CopyField } from "@/types/copy";
import type { ContainerType } from "@/types/container";

export const productCopyLayoutSystemPrompt = `你是资深消费品包装信息架构师。你的任务是把用户已经选择的文案分配到包装正面、侧面、背面，而不是创作新卖点。不得增加原文没有的功效、成分、数字、认证、实验结论或承诺。品牌名、产品名、规格和关键数字必须保持原文；主副标语保持原意；功效、成分、用法和背标可忠实精简。只输出严格 JSON。`;

export function buildProductCopyLayoutPrompt(params:{brief:DesignBrief;fields:CopyField[];container?:ContainerType;viewMode:"two_view"|"three_view"}){
  const flat=params.viewMode==="two_view"||params.container?.kind==="flexible_pack";
  return `请为以下产品生成包装上版规划。

品牌：${params.brief.brand.name}
产品：${params.brief.product.name}
品类：${params.brief.product.category}
产品形态：${params.container?.name||"由 AI 根据品类推导"}
视图：${flat?"正面与背面；侧视图仅展示结构，严禁文字":"正面、侧面、背面"}

用户已勾选的内容（只允许使用这些来源）：
${params.fields.map(field=>`- sourceKey=${field.key}；${field.label}：${field.content}`).join("\n")||"无"}

规则：
1. 正面保持少而清晰：品牌、产品名、主标语，最多再放 1–2 条短卖点。
2. 功效、成分、用法和背标优先放背面；真实立体结构的侧面只放一条短信息。
3. ${flat?"所有内容只能分配到 front 或 back，不得分配到 side。":"侧面内容必须短，不能复制背面长文。"}
4. main_slogan/sub_slogan 保持含义，可为包装阅读适度精简；功效、成分、用法、背标允许忠实压缩与合并，但不得改变事实。
5. 每个已勾选 sourceKey 必须且只能返回一次；不要返回未勾选字段。
6. role 只能是 slogan/benefit/ingredient/usage/back_label；priority 只能为 1/2/3。

严格返回：{"items":[{"sourceKey":"main_slogan","displayText":"原文","face":"front","role":"slogan","priority":1,"enabled":true}],"notes":["规划说明"]}`;
}
