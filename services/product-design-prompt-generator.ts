import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import type { DesignBrief } from "@/types/design-brief";
import type { ContainerType } from "@/types/container";
import type {
  ProductDesignPromptDirection,
  ProductStructureMode,
} from "@/types/product-design";

export interface ProductDesignPromptParams {
  brief: DesignBrief;
  logoStyleTags: string[];
  fixedLogoReference: { id: string; name: string; dataUrl: string };
  viewMode: "two_view" | "three_view";
  structureMode: ProductStructureMode;
  container?: ContainerType;
  requirement: string;
  count: number;
  referenceImageNames?: string[];
  referenceImages?: {id:string;name:string;dataUrl:string}[];
}

export const productDesignPromptGenerator = {
  async generate(params: ProductDesignPromptParams): Promise<ProductDesignPromptDirection[]> {
    const provider = await getAiProvider("copy");
    try {
      const items = await callAi<Omit<ProductDesignPromptDirection, "id" | "selected">[]>(
        "structure",
        "copy",
        { action: "product-design-prompts", provider, params },
      );
      return items.map((item, index) => {
        const promptZh = (item.promptZh || item.prompt || item.summary).trim();
        return {
        ...item,
        copyAdaptations: [],
        prompt: promptZh,
        promptZh,
        promptEn: undefined,
        id: `design-prompt-${Date.now()}-${index}`,
        selected: true,
      }});
    } catch (error) {
      emitAiNotice(`设计提示词生成失败（${provider}）：${aiErrorMessage(error)}`);
      throw error;
    }
  },
};
