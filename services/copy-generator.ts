import type { CopyField, CopyGenerationParams, CopyPackage } from "@/types/copy";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";

export interface CopyRewriteParams {
  field: CopyField;
  instruction: string;
  brief: CopyGenerationParams["brief"];
}

export interface CopyGenerator {
  generate(params: CopyGenerationParams): Promise<CopyPackage[]>;
  rewriteField(params: CopyRewriteParams): Promise<string[]>;
}

class ProviderCopyGenerator implements CopyGenerator {
  async generate(params: CopyGenerationParams): Promise<CopyPackage[]> {
    const provider = await getAiProvider("copy");
    try {
      return await callAi<CopyPackage[]>("copy", "copy", { action: "generate", provider, params });
    } catch (error) {
      emitAiNotice(`文案生成失败：${aiErrorMessage(error)}`);
      throw error;
    }
  }

  async rewriteField(params: CopyRewriteParams): Promise<string[]> {
    const provider = await getAiProvider("copy");
    try {
      return await callAi<string[]>("copy", "copy", { action: "rewrite", provider, params });
    } catch (error) {
      emitAiNotice(`单条重写失败：${aiErrorMessage(error)}`);
      throw error;
    }
  }
}

export const copyGenerator: CopyGenerator = new ProviderCopyGenerator();
