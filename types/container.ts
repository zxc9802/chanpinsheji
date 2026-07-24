export type ProductStructureKind = "liquid_container" | "flexible_pack" | "solid_product" | "custom";
export type ProductStructureSource = "builtin" | "ai" | "upload" | "manual";
export type ProductShapeFamily = "bottle" | "jar" | "tube" | "pouch" | "rectangular_device" | "cylindrical" | "rigid_body" | "wearable" | "custom";

export interface ContainerType {
  id: string;
  name: string;
  sketchUrl: string;
  suitableCategories: string[];
  dispensingType: string;
  volumeOptions: string[];
  costLevel: 1 | 2 | 3;
  materialOptions: string[];
  viewMode: "two_view" | "three_view" | "auto";
  kind?: ProductStructureKind;
  source?: ProductStructureSource;
  shapeFamily?: ProductShapeFamily;
  description?: string;
  recommendationReason?: string;
  dimensions?: string;
  engineeringVerificationRequired?: boolean;
  referenceImageUrl?: string;
  isCustom?: boolean;
}

export interface SelectedContainerSpec {
  id: string;
  name: string;
  volume: string;
  dispensingType: string;
  sketchUrl?: string;
  viewMode?: "two_view" | "three_view" | "auto";
  isCustom?: boolean;
  kind?: ProductStructureKind;
  source?: ProductStructureSource;
  description?: string;
  dimensions?: string;
  shapeFamily?: ProductShapeFamily;
}
