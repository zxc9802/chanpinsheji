import type { LogoCandidate } from "./logo";
import type { CopyPackage } from "./copy";
import type { ProductDesignCandidate } from "./product-design";
import type { PackagingCandidate } from "./packaging";
import type { ContainerType } from "./container";

export type AssetKind = "logo" | "product" | "packaging";
export type Point = [number, number];
export type DesignRegion = {
  id: string;
  kind: "text" | "logo" | "bottle" | "packaging" | "decoration";
  label: string;
  text?: string;
  polygon: Point[]; // Normalized to 0..1000, independent of preview scale.
  confidence: number;
  source: "vision" | "manual";
};
export type QuickBundle = {
  logo: LogoCandidate;
  copy: CopyPackage;
  container: ContainerType;
  product: ProductDesignCandidate;
  packaging: PackagingCandidate;
};
export type StudioVersion = {
  id: string;
  kind: AssetKind;
  imageUrl: string;
  parentId?: string;
  instruction: string;
  createdAt: string;
};
export type StudioState = {
  reference?: { name: string; dataUrl: string };
  documentName?: string;
  styleHint: string;
  draft: Partial<QuickBundle>;
  stage: string;
  error?: string;
  pending?: { jobId: string; stage: AssetKind };
  edit?: { kind: AssetKind; assetId: string; pending: { jobId: string; original: string; region?: DesignRegion; segmentedMask?: string; instruction: string; replacementText: string } };
  regions: Record<string, DesignRegion[]>;
  versions: StudioVersion[];
};
export const emptyStudioState = (): StudioState => ({ styleHint: "", draft: {}, stage: "idle", regions: {}, versions: [] });
