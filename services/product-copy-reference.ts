import type { CopyField } from "@/types/copy";
import type {
  ProductCopyAdaptation,
  ProductCopyReferenceItem,
  ProductCopyReferencePolicy,
} from "@/types/product-design";

export const productCopyReferencePolicy: ProductCopyReferencePolicy = {
  mode: "semantic_reference",
  frontMax: 1,
  supportingMax: 3,
  slogans: "preserve_meaning",
  otherCopy: "adaptable",
};

export function buildProductCopyReferences(fields: CopyField[]): ProductCopyReferenceItem[] {
  return fields.map((field) => ({
    id: `copy-reference-${field.key}`,
    sourceKey: field.key,
    sourceLabel: field.label,
    sourceText: field.content.trim(),
    fidelity:
      field.key === "main_slogan" || field.key === "sub_slogan"
        ? "preserve_meaning"
        : "adaptable",
  })).filter((item) => item.sourceText);
}

export function buildCopyReferenceInstruction(
  adaptations: ProductCopyAdaptation[] | undefined,
) {
  const active = (adaptations || []).filter((item) => item.displayText.trim());
  if (!active.length) {
    return "本方向没有采用参考池中的附加文案。包装只保留定稿 Logo、品牌名、产品名、规格和真实关键数字；不得补写随机卖点、功效、成分或系统字段名。";
  }
  const byFace = (["front", "side", "back"] as const).flatMap((face) => {
    const texts = active
      .filter((item) => item.face === face)
      .sort((a, b) => a.priority - b.priority)
      .map((item) => `“${item.displayText.trim()}”`);
    if (!texts.length) return [];
    return [`${face === "front" ? "正面" : face === "side" ? "侧面" : "背面"}可参考使用：${texts.join("、")}`];
  });
  return `【本方向从内容参考池中择取的短文案】
${byFace.join("\n")}
这些短文案是语义参考而非固定版式，允许图像模型根据设计层级自然安排，但不得恢复原始长文、不得逐条塞满包装，也不得印出“背面信息、功效说明、成分说明、使用说明”等系统字段名。`;
}
