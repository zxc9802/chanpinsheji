import { callAi } from "@/lib/ai-client";
import type { DesignBrief } from "@/types/design-brief";
import type { BoxType, PackagingReferenceAnalysis } from "@/types/packaging";

export const packagingStructureAnalyzer = {
  async analyze(brief: DesignBrief, boxType: BoxType): Promise<PackagingReferenceAnalysis> {
    const imageUrl = boxType.referenceImageUrl || boxType.structureImageUrl;
    if (!imageUrl) throw new Error("缺少外包装结构参考图");
    return callAi<PackagingReferenceAnalysis>("packaging", "copy", {
      action: "packaging-structure-identify",
      provider: "gemini",
      params: {
        imageUrl,
        category: brief.product.category,
        productName: brief.product.name,
      },
    });
  },
};
