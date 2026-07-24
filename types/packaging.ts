import type { CopyPackage } from "./copy";
import type { DesignBrief } from "./design-brief";

export type PackagingFaceName = "front" | "back" | "left" | "right" | "top" | "bottom";
export type PackagingElementType = "logo" | "main_slogan" | "sub_slogan" | "efficacy" | "ingredient" | "usage" | "product_name" | "decoration";
export type PackagingVariationHint = "换配色" | "更简约" | "更满版" | "调整主视觉位置";

export interface PackagingFace {
  face: PackagingFaceName;
  elements: { type: PackagingElementType; content: string; position: string }[];
}

export interface PackagingGenParams {
  brief: DesignBrief;
  finalLogo: { imageUrl: string; styleTags: string[] };
  finalCopy: CopyPackage;
  finalProductDesign: { imageUrl?: string; cmf: { colorScheme: string[]; material: string; finish: string } };
  boxTypeId: string;
  boxType?: BoxType;
  basePackagingId?: string;
  basePackagingImageUrl?: string;
  designPrompt?: string;
  directionName?: string;
  count: number;
  variationHint?: PackagingVariationHint;
}

export interface PackagingCandidate {
  id: string;
  boxTypeId: string;
  previewImageUrl: string;
  faces: PackagingFace[];
  palette: string[];
  costEstimate: string;
  renderMode?: "legacy_dieline" | "direct_ai_preview";
  generationPrompt?: string;
  directionName?: string;
  createdAt?: string;
  subjectReviewStatus?: "pending" | "completed" | "failed";
  subjectReview?: PackagingSubjectReview;
  parentId?: string;
  round: number;
}

export type PackagingStructureKind =
  | "folding_carton"
  | "rigid_box"
  | "drawer_box"
  | "tube"
  | "pouch"
  | "tray"
  | "custom";

export interface PackagingReferenceAnalysis {
  subjectType: "outer_package";
  structureKind: PackagingStructureKind;
  structureName: string;
  structureSummary: string;
  openingMethod: string;
  outlineRatio: string;
  viewMode: "two_view" | "three_view";
  confidence: number;
  analyzedAt: string;
}

export interface PackagingSubjectReview {
  status: "pass" | "warning";
  score: number;
  outerPackageCorrect: boolean;
  structureSimilarity: number;
  productDominance: number;
  structureViewsPure: boolean;
  issues: string[];
  retryHint: string;
  reviewedAt: string;
}

export interface BoxType {
  id: string;
  name: string;
  structureImageUrl: string;
  dielineImageUrl: string;
  suitableCategories: string[];
  referenceDimensions: [number, number, number];
  referenceDimensionsLabel: string;
  costLevel: 1 | 2 | 3 | 4;
  costLabel: string;
  description: string;
  source?: "builtin" | "upload";
  referenceImageUrl?: string;
  referenceAnalysis?: PackagingReferenceAnalysis;
}

export interface FinalPackagingDesign {
  candidate: PackagingCandidate;
  boxType: BoxType;
  /** Historical projects may still contain a dieline. New AI preview projects do not. */
  dielineImageUrl?: string;
  finalizedAt: string;
}

export interface PackagingPromptOption {
  id: string;
  subjectType: "outer_package";
  structureSummary: string;
  directionName: string;
  designSummary: string;
  promptZh: string;
  selected: boolean;
}

export interface PackagingProjectState {
  promptVersion: 2;
  selectedBoxTypeId?: string;
  uploadedBoxType?: BoxType;
  structureConfirmed?: boolean;
  candidates: PackagingCandidate[];
  favoriteIds: string[];
  finalDesign?: FinalPackagingDesign;
  generationRound: number;
  designRequirement: string;
  promptDirectionCount: number;
  promptOptions: PackagingPromptOption[];
  /** Legacy single-prompt fields retained for historical projects. */
  generationPrompt: string;
  generationCount: number;
}

export const emptyPackagingProject = (): PackagingProjectState => ({
  promptVersion: 2,
  candidates: [], favoriteIds: [], generationRound: 0, structureConfirmed: false,
  designRequirement: "", promptDirectionCount: 3, promptOptions: [],
  generationPrompt: "", generationCount: 3,
});
