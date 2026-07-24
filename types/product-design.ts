import type { DesignBrief } from "./design-brief";
import type { ContainerType, SelectedContainerSpec } from "./container";
import type { CopyField, CopyFieldKey } from "./copy";
import type { LogoType } from "./logo";

export interface ProductImageGenParams {
  brief: DesignBrief;
  finalLogo: { id: string; styleTags: string[]; imageUrl?: string; logoType?:LogoType };
  /** Legacy-only. New product concept generations intentionally do not read step 3 copy. */
  finalCopy?: { toneTags: string[]; fields?: CopyField[] };
  styleDirection?: string;
  containerTypeId: string;
  containerType?: ContainerType;
  volume: string;
  baseDesignId?: string;
  count: number;
  variationHint?: "换配色" | "换材质" | "换器形" | "更简约" | "更精致";
  baseCmf?: ProductDesignCandidate["cmf"];
  containerReferenceImageUrl?: string;
  containerViewMode?: "two_view" | "three_view" | "auto";
  customPrompt?: string;
  customColors?: { name: string; hex: string }[];
  designDirection?: ProductDesignDirectionSnapshot;
  designReferenceImages?: { id: string; imageUrl: string }[];
  designReferenceImageUrls?: string[];
  copyReferences?: ProductCopyReferenceItem[];
  /** Legacy-only: retained so historical projects and candidates remain readable. */
  copyLayoutPlan?: ProductCopyLayoutPlan;
  onStatus?: (status: ProductDirectGenerationStatus) => void;
}

export type ProductDirectGenerationStatus =
  | "queued"
  | "preparing_references"
  | "uploading_references"
  | "generating"
  | "completed"
  | "failed";

export type ProductCopyFace = "front" | "side" | "back";
export type ProductCopyRole = "logo" | "brand" | "product_name" | "slogan" | "benefit" | "ingredient" | "usage" | "back_label";
export type ProductCopySourceKey = CopyFieldKey | "logo" | "brand_name" | "product_name" | "manual";
export type ProductCopyFidelity = "exact" | "preserve_meaning" | "adaptable";

export interface ProductCopyReferenceItem {
  id: string;
  sourceKey: CopyFieldKey;
  sourceLabel: string;
  sourceText: string;
  fidelity: ProductCopyFidelity;
}

export interface ProductCopyReferencePolicy {
  mode: "semantic_reference";
  frontMax: 1;
  supportingMax: 3;
  slogans: "preserve_meaning";
  otherCopy: "adaptable";
}

export interface ProductCopyLayoutItem {
  id: string;
  sourceKey: ProductCopySourceKey;
  sourceLabel: string;
  sourceText: string;
  displayText: string;
  face: ProductCopyFace;
  role: ProductCopyRole;
  priority: 1 | 2 | 3;
  enabled: boolean;
  /** 旧项目可为空；读取时会依据 sourceKey 自动补齐。 */
  fidelity?: ProductCopyFidelity;
}

export interface ProductCopyLayoutPlan {
  id: string;
  items: ProductCopyLayoutItem[];
  viewMode: "two_view" | "three_view";
  notes: string[];
  confirmed: boolean;
  generatedAt: string;
}

export type ProductStructureMode = "reference" | "ai_infer";
export type ProductCreativeStrategy =
  | "open_creative"
  | "editorial_minimal"
  | "scientific_precision"
  | "tactile_luxury"
  | "signature_illustration"
  | "contemporary_geometry";
export type ProductPresentationLayout =
  | "free_composition"
  | "top_views_bottom_scene"
  | "left_views_right_scene"
  | "hero_top_views_bottom"
  | "right_views_left_scene"
  | "editorial_inset_views";

export interface ProductCopyAdaptation {
  sourceItemId: string;
  sourceKey: ProductCopySourceKey;
  sourceText: string;
  displayText: string;
  face: ProductCopyFace;
  priority: 1 | 2 | 3;
  fidelity: ProductCopyFidelity;
  reason: string;
}

export interface ProductInspirationSource {
  kind: "brief" | "logo" | "copy" | "reference_image" | "user_requirement";
  label: string;
  usage: string;
}

export interface ProductTypographySystem {
  fontPairing: string;
  hierarchy: {
    brand: string;
    productName: string;
    slogan: string;
    supporting: string;
    body: string;
  };
  alignment: string;
  spacing: string;
  grid: string;
  graphicIntegration: string;
}

export interface ProductSurfaceCmf {
  colors: { name: string; hex: string }[];
  graphicLanguage: string;
  typographyStyle: string;
  printFinish: string;
  sceneDirection: string;
  composition: string;
}

export interface ProductDesignDirectionSnapshot {
  creativeStrategy: ProductCreativeStrategy;
  presentationLayout: ProductPresentationLayout;
  graphicLanguage: string;
  informationLayout: string;
  materialStrategy: string;
  sceneDirection: string;
  avoidMotifs: string[];
  referenceImageIds: string[];
  creativeConcept: string;
  visualPersonality: string;
  designRationale: string;
  inspirationSources: ProductInspirationSource[];
  surfaceCmf: ProductSurfaceCmf;
  typographySystem: ProductTypographySystem;
  copyAdaptations: ProductCopyAdaptation[];
}

export interface ProductDesignPromptDirection {
  id: string;
  name: string;
  summary: string;
  prompt: string;
  promptZh?: string;
  promptEn?: string;
  colors?: { name: string; hex: string }[];
  creativeStrategy?: ProductCreativeStrategy;
  presentationLayout?: ProductPresentationLayout;
  graphicLanguage?: string;
  informationLayout?: string;
  materialStrategy?: string;
  sceneDirection?: string;
  avoidMotifs?: string[];
  referenceImageIds?: string[];
  creativeConcept?: string;
  visualPersonality?: string;
  designRationale?: string;
  inspirationSources?: ProductInspirationSource[];
  surfaceCmf?: ProductSurfaceCmf;
  typographySystem?: ProductTypographySystem;
  copyAdaptations?: ProductCopyAdaptation[];
  selected: boolean;
}
export interface ProductDesignReferenceImage { id: string; name: string; dataUrl: string; }

export interface ProductDesignCandidate {
  id: string;
  createdAt?: string;                // 生成时间，用于最新优先与 24 小时后缩略展示
  imageUrl: string;              // 9:16 最终设计长图（下载归一化为 1080×1920）
  heroImageUrl?: string;         // 商业场景效果图源图
  technicalSheetUrl?: string;    // 正/侧/背结构校验图
  styleDirection: string;
  containerType: SelectedContainerSpec;
  cmf: { colorScheme: string[]; colors?: { name: string; hex: string }[]; material: string; finish: string };
  matchedSellingPoints: string[];
  avoidedPainPoints: string[];
  viewMode: "two_view" | "three_view" | "auto";
  copyApplied: { key: CopyFieldKey; label: string; content: string }[];
  copyReferenceKeys?: CopyFieldKey[];
  copyLayout?: ProductCopyLayoutItem[];
  copyAdaptations?: ProductCopyAdaptation[];
  composedViews?: ProductDesignView[];
  layoutWarnings?: string[];
  logoType?:LogoType;
  sourceViews?: ProductDesignView[];
  generationPrompt?: string;
  renderMode?: "legacy_composite" | "direct_ai";
  generationStatus?: ProductDirectGenerationStatus;
  referenceBoardSnapshot?: string;
  directionSnapshot?: ProductDesignDirectionSnapshot;
  qualityReview?: ProductDesignQualityReview;
  qualityReviewStatus?: "pending" | "completed" | "failed";
  parentId?: string;
  round: number;
}

export interface ProductDesignQualityReview {
  score: number;
  status: "pass" | "warning";
  categoryCorrect: boolean;
  requiredViewsComplete: boolean;
  layoutCompliant: boolean;
  logoConsistent: boolean;
  logoFidelity: number;
  sceneQuality: number;
  brandQuality: number;
  typographyQuality: number;
  /** New reviews use the category-aware information completeness profile. */
  informationComplete?: boolean;
  similarityScore: number;
  similarCandidateId?: string;
  issues: string[];
  retryHint: string;
  reviewedAt: string;
}

export interface ProductDesignState {
  renderVersion: 9;
  structureMode?: ProductStructureMode;
  selectedContainerTypeId?: string;
  selectedVolume?: string;
  generationCount: number;
  selectedDirections: string[];
  candidates: ProductDesignCandidate[];
  favoriteIds: string[];
  finalDesignId?: string;
  finalWarnings: string[];
  generationRound: number;
  customContainers: ContainerType[];
  aiRecommendedContainers: ContainerType[];
  structureRecommendationFingerprint?: string;
  structureConfirmed: boolean;
  selectedCopyFieldKeys: CopyFieldKey[];
  designRequirement: string;
  promptDirectionCount: number;
  designPrompts: ProductDesignPromptDirection[];
  designReferenceImages: ProductDesignReferenceImage[];
  copyLayoutPlan?: ProductCopyLayoutPlan;
}

export const emptyProductDesignState = (): ProductDesignState => ({
  renderVersion: 9, structureMode:"reference", selectedDirections: [], candidates: [], favoriteIds: [], finalWarnings: [], generationRound: 0, generationCount: 1, customContainers: [], aiRecommendedContainers: [], structureConfirmed:false, selectedCopyFieldKeys:[], designRequirement:"",promptDirectionCount:3,designPrompts:[],designReferenceImages:[],
});

export type ProductViewType = "front" | "side" | "back";

export interface ProductDesignView {
  type: ProductViewType;
  rawImageUrl?: string;
  status: "ready" | "failed";
  error?: string;
}
