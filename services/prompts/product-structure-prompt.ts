import type { DesignBrief } from "@/types/design-brief";

export const productStructureSystemPrompt = `你是消费品、电子产品与工业设计领域的产品结构策略师。请根据产品事实推荐适合做外观设计的产品形态或载体。不得把固体成品误判成液体容器，不得虚构精确工程参数。只输出严格 JSON。所有建议仅作为概念设计依据，生产前必须工程验证。`;

export function buildProductStructurePrompt(brief:DesignBrief,count=4){
  return `请为以下产品推荐 ${Math.max(3,Math.min(6,count))} 种彼此有明显差异、但确实适配该品类的产品形态。

产品名称：${brief.product.name||"未提供"}
行业：${brief.product.industry||"未提供"}
品类：${brief.product.category||"未提供"}
质地/物态：${brief.product.texture||"未提供"}
使用场景：${brief.product.usageScenarios||"未提供"}
目标人群：${brief.consumer.ageRange||"未提供"} ${brief.consumer.keywords.join("、")||""}
尺寸约束：${brief.hardConstraints.dimensions||"未提供"}
卖点：${brief.product.coreSellingPoints.map(item=>item.point).join("；")||"未提供"}

规则：
1. kind 只能是 liquid_container、flexible_pack、solid_product、custom。
2. shapeFamily 只能是 bottle、jar、tube、pouch、rectangular_device、cylindrical、rigid_body、wearable、custom。
3. 固体产品必须优先使用 solid_product，不得出现“出液方式”；interactionMethod 应写接口、开合、握持、穿戴等使用方式。
4. 液体、膏体或片材才可以推荐瓶、罐、软管、袋。
5. specificationOptions 给出 1–4 个规格；没有可靠数值时使用“按实际产品尺寸”。
6. viewMode 只能是 two_view 或 three_view。没有有意义侧面的扁平袋使用 two_view，其余通常使用 three_view。
7. recommendationReason 必须直接说明为什么适配当前产品。

严格返回：
{"recommendations":[{"name":"","kind":"solid_product","shapeFamily":"rectangular_device","description":"","interactionMethod":"","specificationOptions":[""],"materialOptions":[""],"costLevel":2,"viewMode":"three_view","recommendationReason":""}]}`;
}

export function buildProductStructureIdentificationPrompt(brief:DesignBrief){
  return `请识别图片中的产品本体、内包材或载体结构，并结合以下信息填写一条可编辑的结构记录：产品“${brief.product.name}”，品类“${brief.product.category}”，尺寸约束“${brief.hardConstraints.dimensions||"未提供"}”。不要识别图片中的品牌文案，不要猜测精确尺寸；无法确认时写“按参考图实测”。严格返回 {"recommendations":[{"name":"","kind":"custom","shapeFamily":"custom","description":"","interactionMethod":"","specificationOptions":[""],"materialOptions":[""],"costLevel":2,"viewMode":"three_view","recommendationReason":"来自用户上传的真实结构参考图"}]}。`;
}
