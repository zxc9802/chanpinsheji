import { callAi } from "@/lib/ai-client";
import type { PackagingCandidate, PackagingReferenceAnalysis, PackagingSubjectReview } from "@/types/packaging";

export const packagingQualityReviewer = {
  async review(
    candidate: PackagingCandidate,
    structureImageUrl: string,
    structure: PackagingReferenceAnalysis,
  ): Promise<PackagingSubjectReview> {
    return callAi<PackagingSubjectReview>("packaging", "copy", {
      action: "packaging-subject-review",
      provider: "gemini",
      params: {
        imageUrl: candidate.previewImageUrl,
        structureImageUrl,
        structure,
      },
    });
  },
};
