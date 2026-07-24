import type { DesignBrief } from "./design-brief";

export type LogoType = "wordmark" | "lettermark" | "pictorial" | "abstract" | "combination" | "emblem";
export type LogoFontStyle = "serif" | "sans" | "handwritten";

export interface LogoGenerationParams {
  brief: DesignBrief;
  styleHint?: string;
  baseLogoId?: string;
  count: number;
  logoTypes?: LogoType[];
  fontStyle?: LogoFontStyle | null;
  fontWeight?: number;
  colorPreference?: string;
  avoidElements?: string;
}

export interface LogoCandidate {
  id: string;
  imageUrl: string;
  styleTags: string[];
  matchedSellingPoints: string[];
  logoType: LogoType;
  parentId?: string;
  round: number;
}

export interface DeletedLogoCandidate {
  candidate: LogoCandidate;
  deletedAt: string;
  wasFavorite: boolean;
}

export interface LogoProjectState {
  candidates: LogoCandidate[];
  deletedCandidates: DeletedLogoCandidate[];
  favoriteIds: string[];
  finalLogoId?: string;
  generationRound: number;
  styleHint?: string;
  logoTypes: LogoType[];
  fontStyle: LogoFontStyle | null;
  fontWeight: number;
  colorPreference: string;
  avoidElements: string;
  generationCount: number;
}

export interface BrandLogoAsset {
  type: "logo";
  id: string;
  brandName: string;
  projectId: string;
  candidate: LogoCandidate;
  finalizedAt: string;
}

export const emptyLogoProject = (): LogoProjectState => ({
  candidates: [],
  deletedCandidates: [],
  favoriteIds: [],
  generationRound: 0,
  logoTypes: [],
  fontStyle: null,
  fontWeight: 3,
  colorPreference: "",
  avoidElements: "",
  generationCount: 12,
});
