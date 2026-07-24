import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import type { DesignBrief } from "@/types/design-brief";
import type { BoxType, PackagingPromptOption } from "@/types/packaging";

export interface PackagingDesignPromptParams {
  brief: DesignBrief;
  boxType: BoxType;
  productCmf: { colorScheme: string[]; material: string; finish: string };
  logoImageUrl: string;
  mainSlogan?: string;
  requirement: string;
  count: number;
}

export const packagingDesignPromptGenerator = {
  async generate(params: PackagingDesignPromptParams): Promise<PackagingPromptOption[]> {
    const provider = await getAiProvider("copy");
    try {
      const result = await callAi<{ directions: {
        subjectType: "outer_package";
        structureSummary: string;
        directionName: string;
        designSummary: string;
        promptZh: string;
      }[] }>(
        "packaging",
        "copy",
        { action: "packaging-design-prompt", provider, params },
      );
      if (!Array.isArray(result.directions) || result.directions.length !== params.count) {
        throw new Error(`AI 应返回 ${params.count} 条包装设计提示词`);
      }
      return result.directions.map((item, index) => ({
        id: `pack-prompt-${Date.now()}-${index}`,
        subjectType: "outer_package",
        structureSummary: item.structureSummary.trim(),
        directionName: item.directionName.trim() || `方向 ${index + 1}`,
        designSummary: item.designSummary.trim(),
        promptZh: item.promptZh.trim(),
        selected: true,
      }));
    } catch (error) {
      emitAiNotice(`包装提示词生成失败（${provider}）：${aiErrorMessage(error)}`);
      throw error;
    }
  },
};
