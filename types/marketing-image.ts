import type { CopyPackage } from "./copy";
import type { PackagingCandidate } from "./packaging";
import type { ProductDesignCandidate } from "./product-design";

export type ImageType = "main_image" | "scene_image" | "detail_selling_point" | "multi_angle" | "packaging_shot";

export interface MarketingImageParams {
  finalLogo: { imageUrl: string };
  finalCopy: CopyPackage;
  finalProductDesign: ProductDesignCandidate;
  finalPackaging: PackagingCandidate;
  imageTypes: ImageType[];
  quantities?: Partial<Record<ImageType, number>>;
}

export interface MarketingImage {
  id: string;
  type: ImageType;
  imageUrl: string;
  title: string;
  copyUsed: string[];
  palette: string[];
}

export interface MarketingImageProjectState {
  selectedTypes: ImageType[];
  quantities: Record<ImageType, number>;
  images: MarketingImage[];
  generationRound: number;
}

export const imageTypes: ImageType[] = ["main_image","scene_image","detail_selling_point","multi_angle","packaging_shot"];
export const emptyMarketingImageProject = (): MarketingImageProjectState => ({
  selectedTypes:[...imageTypes], quantities:{main_image:3,scene_image:3,detail_selling_point:3,multi_angle:2,packaging_shot:2}, images:[], generationRound:0,
});
