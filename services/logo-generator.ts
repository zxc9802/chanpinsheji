import type { LogoCandidate, LogoGenerationParams } from "@/types/logo";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import { buildLogoPrompt, logoTypeForIndex } from "./prompts/image-prompts";

export interface LogoGenerator {
  generate(params: LogoGenerationParams): Promise<LogoCandidate[]>;
}

class ProviderLogoGenerator implements LogoGenerator {
  async generate(params: LogoGenerationParams): Promise<LogoCandidate[]> {
    const provider = await getAiProvider("image");
    const count = Math.max(1, Math.min(12, params.count));
    try {
      const urls = await callAi<(string | undefined)[]>("logo", "image", {
        prompts: Array.from({ length: count }, (_, index) => buildLogoPrompt(params, index)),
      });
      const sellingPoints = params.brief.product.coreSellingPoints.map((item) => item.point);
      const matches = sellingPoints.length ? sellingPoints : params.brief.product.efficacy;
      const tags = [...new Set(params.brief.brand.personality)].slice(0, 3);
      const candidates = urls.flatMap((imageUrl, index) => imageUrl ? [{
        id: `logo-ai-${Date.now()}-${index}`,
        imageUrl,
        styleTags: tags.length ? tags : ["品牌识别", "AI生成"],
        logoType: logoTypeForIndex(params,index),
        matchedSellingPoints: matches.length ? [matches[index % matches.length]] : ["品牌识别"],
        ...(params.baseLogoId ? { parentId: params.baseLogoId } : {}),
        round: 1,
      }] : []);
      if (candidates.length / count <= .5) throw new Error(`仅成功生成 ${candidates.length}/${count} 张图片`);
      return candidates;
    } catch (error) {
      emitAiNotice(`Logo 生成失败（${provider}）：${aiErrorMessage(error)}`);
      throw error;
    }
  }
}

export const logoGenerator: LogoGenerator = new ProviderLogoGenerator();
