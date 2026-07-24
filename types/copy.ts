import type { DesignBrief } from "./design-brief";

export type CopyFieldKey = "main_slogan" | "sub_slogan" | "efficacy_desc" | "ingredient_desc" | "usage_desc" | "back_panel";

export interface CopyGenerationParams {
  brief: DesignBrief;
  finalLogo?: { id: string; styleTags?: string[] };
  toneHint?: string;
  baseCopyId?: string;
}

export interface CopyField {
  key: CopyFieldKey;
  label: string;
  content: string;
  linkedInsightId?: string;
}

export interface CopyPackage {
  id: string;
  directionName: string;
  toneTags: string[];
  fields: CopyField[];
  sourceInsightIds: string[];
  parentId?: string;
  round: number;
}

export interface CopyProjectState {
  packages: CopyPackage[];
  assembledFields: Partial<Record<CopyFieldKey, CopyField>>;
  finalPackage?: CopyPackage;
  generationRound: number;
  toneHint?: string;
}

export interface BrandCopyAsset {
  type: "copy";
  id: string;
  brandName: string;
  projectId: string;
  copyPackage: CopyPackage;
  finalizedAt: string;
}

export const copyFieldKeys: CopyFieldKey[] = ["main_slogan", "sub_slogan", "efficacy_desc", "ingredient_desc", "usage_desc", "back_panel"];
export const copyFieldLabels: Record<CopyFieldKey, string> = {
  main_slogan: "主标语", sub_slogan: "副标语", efficacy_desc: "功效说明",
  ingredient_desc: "成分说明", usage_desc: "使用说明", back_panel: "背面信息",
};

export const emptyCopyProject = (): CopyProjectState => ({ packages: [], assembledFields: {}, generationRound: 0 });
