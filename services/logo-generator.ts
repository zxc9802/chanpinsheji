import type { LogoCandidate, LogoGenerationParams } from "@/types/logo";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import { buildLogoPrompt, logoTypeForIndex } from "./prompts/image-prompts";

export interface LogoGenerator {
  generate(params: LogoGenerationParams,options?: { onCandidate?: (candidate:LogoCandidate) => void }): Promise<LogoCandidate[]>;
}

class ProviderLogoGenerator implements LogoGenerator {
  async generate(params: LogoGenerationParams,options: { onCandidate?: (candidate:LogoCandidate) => void } = {}): Promise<LogoCandidate[]> {
    const provider = await getAiProvider("image");
    const count = Math.max(1, Math.min(12, params.count));
    const candidates:(LogoCandidate|undefined)[]=Array.from({length:count});
    const sellingPoints = params.brief.product.coreSellingPoints.map((item) => item.point);
    const matches = sellingPoints.length ? sellingPoints : params.brief.product.efficacy;
    const tags = [...new Set(params.brief.brand.personality)].slice(0, 3);
    const generationId=Date.now();
    const publishCandidate=(imageUrl:string|undefined,index:number)=>{
      if (!imageUrl || candidates[index]) return;
      const candidate:LogoCandidate={
        id: `logo-ai-${generationId}-${index}`,
        imageUrl,
        styleTags: tags.length ? tags : ["品牌识别", "AI生成"],
        logoType: logoTypeForIndex(params,index),
        matchedSellingPoints: matches.length ? [matches[index % matches.length]] : ["品牌识别"],
        ...(params.baseLogoId ? { parentId: params.baseLogoId } : {}),
        round: 1,
      };
      candidates[index]=candidate;
      options.onCandidate?.(candidate);
    };
    try {
      const urls = await callAi<(string | undefined)[]>("logo", "image", {
        prompts: Array.from({ length: count }, (_, index) => buildLogoPrompt(params, index)),
      },{onProgress:(partialUrls)=>partialUrls.forEach(publishCandidate)});
      urls.forEach(publishCandidate);
      const completed=candidates.filter((candidate):candidate is LogoCandidate=>Boolean(candidate));
      if (!completed.length) throw new Error("图像服务未返回 Logo 图片");
      return completed;
    } catch (error) {
      const completed=candidates.filter((candidate):candidate is LogoCandidate=>Boolean(candidate));
      if (completed.length) return completed;
      emitAiNotice(`Logo 生成失败（${provider}）：${aiErrorMessage(error)}`);
      throw error;
    }
  }
}

export const logoGenerator: LogoGenerator = new ProviderLogoGenerator();
