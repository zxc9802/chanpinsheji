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
export type DesignPlan = {
  concept: string;
  referenceInsights: string;
  palette: { color: string; role: string }[];
  typography: string;
  logo: string;
  product: string;
  packaging: string;
};
export type DesignReview = {
  summary: string;
  issues: { severity: 'major' | 'minor'; location: string; problem: string; fix: string }[];
  preferred?: 'original' | 'revised';
};
export type StudioReview = {
  original: string;
  revised?: string;
  review?: DesignReview;
  comparison?: DesignReview;
  status: 'reviewing' | 'repairing' | 'comparing' | 'done' | 'unavailable';
  selected?: 'original' | 'revised';
  warning?: string;
};
export type CreativeStep = 'plan' | `review:${AssetKind}` | `compare:${AssetKind}`;
export type StudioState = {
  // References saved before modes existed were always used to preserve structure.
  reference?: { name: string; dataUrl: string; mode?: "style" | "structure" };
  documentName?: string;
  styleHint: string;
  draft: Partial<QuickBundle>;
  stage: string;
  error?: string;
  pending?: { jobId: string; stage: AssetKind; phase?: 'generate' | 'repair' };
  direction?: { inputKey: string; plan: DesignPlan };
  creativePending?: { jobId: string; step: CreativeStep };
  reviews?: Partial<Record<AssetKind, StudioReview>>;
  edit?: { kind: AssetKind; assetId: string; pending: { jobId: string; original: string; region?: DesignRegion; segmentedMask?: string; instruction: string; replacementText: string } };
  regions: Record<string, DesignRegion[]>;
  versions: StudioVersion[];
};
export const emptyStudioState = (): StudioState => ({ styleHint: "", draft: {}, stage: "idle", regions: {}, versions: [] });
