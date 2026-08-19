import type { DesignBrief } from "@/types/design-brief";

export type BriefFieldSource = "document" | "ai" | "user";
export type BriefFieldSources = Partial<Record<string, BriefFieldSource>>;

export const BRIEF_FORM_FIELDS = [
  "brand.name",
  "product.name",
  "product.industry",
  "product.category",
  "product.targetMarket",
  "product.salesChannel",
  "product.priceBand",
  "consumer.ageRange",
  "consumer.keywords",
  "brand.positioning",
  "brand.personality",
  "brand.slogan",
  "brand.coreValues",
  "product.coreSellingPoints",
  "product.efficacy",
  "product.keyIngredients",
  "product.usageScenarios",
  "product.texture",
] as const;

export const AI_FILLABLE_FIELDS = BRIEF_FORM_FIELDS.filter(
  (path) => path !== "brand.name" && path !== "product.name",
);

function readPath(brief: DesignBrief, path: string): unknown {
  const [group, key] = path.split(".");
  return (brief as Record<string, Record<string, unknown>>)[group]?.[key];
}

function writePath(brief: DesignBrief, path: string, value: unknown) {
  const [group, key] = path.split(".");
  const next = {
    ...brief,
    [group]: {
      ...(brief as Record<string, Record<string, unknown>>)[group],
      [key]: value,
    },
  };
  return next as DesignBrief;
}

export function isBriefFieldEmpty(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => {
      if (typeof item === "string") return !item.trim();
      if (item && typeof item === "object" && "point" in item) return !String((item as { point?: string }).point || "").trim();
      return true;
    });
  }
  return false;
}

export function listMissingFillableFields(brief: DesignBrief) {
  return AI_FILLABLE_FIELDS.filter((path) => isBriefFieldEmpty(readPath(brief, path)));
}

export function sourcesFromExtractedBrief(brief: DesignBrief): BriefFieldSources {
  return Object.fromEntries(
    BRIEF_FORM_FIELDS
      .filter((path) => !isBriefFieldEmpty(readPath(brief, path)))
      .map((path) => [path, "document" as const]),
  );
}

export function mergeAiFilledBrief(extracted: DesignBrief, generated: DesignBrief) {
  let brief = extracted;
  const fieldSources = sourcesFromExtractedBrief(extracted);
  for (const path of AI_FILLABLE_FIELDS) {
    if (!isBriefFieldEmpty(readPath(extracted, path))) continue;
    const value = readPath(generated, path);
    if (isBriefFieldEmpty(value)) continue;
    brief = writePath(brief, path, value);
    fieldSources[path] = "ai";
  }
  if (!extracted.insights.length && generated.insights.length) {
    brief = { ...brief, insights: generated.insights };
  }
  return { brief, fieldSources };
}

export function countFieldSources(sources: BriefFieldSources) {
  const values = Object.values(sources);
  return {
    extractedCount: values.filter((item) => item === "document").length,
    aiFilledCount: values.filter((item) => item === "ai").length,
  };
}
