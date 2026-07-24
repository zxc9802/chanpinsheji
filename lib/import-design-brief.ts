import { emptyDesignBrief, type DesignBrief } from "@/types/design-brief";

export class DesignBriefImportError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value : "");
const texts = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** 接收 JSON 字符串或对象，校验结构并补齐允许缺省的字段。 */
export function importDesignBrief(json: string | unknown): DesignBrief {
  let input: unknown = json;
  if (typeof json === "string") {
    try {
      input = JSON.parse(json);
    } catch {
      throw new DesignBriefImportError("JSON 格式有误，请检查逗号、引号和括号。 ");
    }
  }
  if (!isRecord(input)) throw new DesignBriefImportError("Design Brief 必须是一个 JSON 对象。");

  const brand = isRecord(input.brand) ? input.brand : null;
  const product = isRecord(input.product) ? input.product : null;
  const consumer = isRecord(input.consumer) ? input.consumer : null;
  if (!brand || !product || !consumer) {
    throw new DesignBriefImportError("缺少 brand、product 或 consumer 核心数据块。");
  }

  const base = emptyDesignBrief();
  const allowedTypes = new Set(["pain_point", "opportunity", "need"]);
  const insights = Array.isArray(input.insights)
    ? input.insights.flatMap((item) => {
        if (!isRecord(item) || !allowedTypes.has(text(item.type))) return [];
        return [{
          id: text(item.id),
          type: text(item.type) as DesignBrief["insights"][number]["type"],
          content: text(item.content),
          frequency: typeof item.frequency === "number" ? item.frequency : 0,
        }];
      })
    : [];

  const sellingPoints = Array.isArray(product.coreSellingPoints)
    ? product.coreSellingPoints.flatMap((item) => {
        if (!isRecord(item) || !text(item.point)) return [];
        return [{ point: text(item.point), ...(text(item.sourceInsightId) ? { sourceInsightId: text(item.sourceInsightId) } : {}) }];
      })
    : [];
  const constraints = isRecord(input.hardConstraints) ? input.hardConstraints : {};

  return {
    projectId: text(input.projectId) || `project-${Date.now()}`,
    brand: {
      name: text(brand.name), positioning: text(brand.positioning),
      personality: texts(brand.personality), slogan: text(brand.slogan), coreValues: text(brand.coreValues),
    },
    product: {
      name: text(product.name), category: text(product.category), industry: text(product.industry),
      targetMarket: text(product.targetMarket), salesChannel: text(product.salesChannel),
      priceBand: text(product.priceBand), coreSellingPoints: sellingPoints,
      keyIngredients: texts(product.keyIngredients), efficacy: texts(product.efficacy),
      usageScenarios: text(product.usageScenarios), texture: text(product.texture),
    },
    consumer: { ageRange: text(consumer.ageRange), keywords: texts(consumer.keywords) },
    insights,
    styleKeywords: texts(input.styleKeywords),
    hardConstraints: {
      ...(text(constraints.maxPackageCost) ? { maxPackageCost: text(constraints.maxPackageCost) } : {}),
      ...(text(constraints.dimensions) ? { dimensions: text(constraints.dimensions) } : {}),
    },
  };
}
