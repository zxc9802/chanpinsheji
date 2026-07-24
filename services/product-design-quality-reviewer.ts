import { callAi } from "@/lib/ai-client";
import type { DesignBrief } from "@/types/design-brief";
import type { ProductDesignCandidate, ProductDesignQualityReview } from "@/types/product-design";
import { resolveProductInformationCompleteness } from "./product-information-completeness";

export const productDesignQualityReviewer={
  async review(candidate:ProductDesignCandidate,brief:DesignBrief,logoImageUrl:string,recentCandidates:ProductDesignCandidate[]):Promise<ProductDesignQualityReview>{
    const completeness=resolveProductInformationCompleteness(brief,candidate.containerType);
    return callAi<ProductDesignQualityReview>("product","copy",{
      action:"product-design-quality",
      provider:"gemini",
      params:{
        imageUrl:candidate.imageUrl,
        logoImageUrl,
        recentCandidates:recentCandidates.filter(item=>item.id!==candidate.id).slice(0,3).map(item=>({id:item.id,imageUrl:item.imageUrl})),
        category:brief.product.category,
        productName:brief.product.name,
        viewMode:candidate.viewMode,
        informationProfileId:completeness.id,
        informationCompletenessRule:completeness.reviewRule,
        direction:candidate.directionSnapshot,
      },
    });
  },
};
