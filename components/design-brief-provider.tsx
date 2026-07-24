"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { emptyDesignBrief, type DesignBrief } from "@/types/design-brief";
import { importDesignBrief } from "@/lib/import-design-brief";
import { emptyLogoProject, type BrandLogoAsset, type LogoProjectState, type LogoType } from "@/types/logo";
import { emptyCopyProject, type BrandCopyAsset, type CopyPackage, type CopyProjectState } from "@/types/copy";
import type { BrandAsset } from "@/types/brand-assets";
import { emptyProductDesignState, type ProductDesignState } from "@/types/product-design";
import { defaultDirectionSnapshot, fixedProductPresentationLayout } from "@/services/product-design-diversity";
import { aiGeneratedPackagingBoxTypeId, emptyPackagingProject, type PackagingProjectState } from "@/types/packaging";
import { aiGeneratedBoxType, boxTypes } from "@/services/packaging-generator";
import { containerTypes } from "@/services/container-library";
import { emptyMarketingImageProject, type MarketingImageProjectState } from "@/types/marketing-image";
import { emptyDeliveryState, type DeliveryState, type ExportRecord, type ProjectTemplate, type QualityCheckItem } from "@/types/delivery";
import { loadProjectIndex, loadProjectState, requestPersistentProjectStorage, saveProjectIndex, saveProjectState, type StoredProjectSummary } from "@/lib/project-storage";

const LEGACY_STORAGE_KEY = "packaging-agent:project";
const LEGACY_LOGO_TYPES:LogoType[]=["wordmark","lettermark","pictorial","abstract","combination","emblem"];
const isRasterAiImage=(url?:string)=>Boolean(url&&(!url.startsWith("data:image/svg+xml")||/data%3Aimage%2F(?:jpeg|png|webp)|https?%3A/i.test(url)));
function removeSimulationData(input:Partial<ProjectState>):Partial<ProjectState>{
  const productRenderVersion=Number((input.productDesign as {renderVersion?:number}|undefined)?.renderVersion||0);
  if(input.productDesign&&productRenderVersion<4){
    input={...input,completedSteps:(input.completedSteps||[]).filter(step=>step<=3),productDesign:{...emptyProductDesignState(),selectedContainerTypeId:input.productDesign.selectedContainerTypeId,selectedVolume:input.productDesign.selectedVolume,selectedDirections:(input.productDesign.selectedDirections||[]).slice(0,3),generationCount:Math.min(4,Math.max(1,input.productDesign.generationCount||2)),customContainers:input.productDesign.customContainers||[],aiRecommendedContainers:input.productDesign.aiRecommendedContainers||[],structureRecommendationFingerprint:input.productDesign.structureRecommendationFingerprint},packagingProject:emptyPackagingProject(),marketingImages:emptyMarketingImageProject(),delivery:{...emptyDeliveryState(),templates:input.delivery?.templates||[]}};
  }
  const logoCandidates=(input.logoProject?.candidates||[]).filter(item=>item.id.startsWith("logo-ai-")&&isRasterAiImage(item.imageUrl)).map((item,index)=>({...item,logoType:item.logoType||LEGACY_LOGO_TYPES[index%LEGACY_LOGO_TYPES.length]}));
  const deletedLogoCandidates=(input.logoProject?.deletedCandidates||[]).filter(item=>item.candidate.id.startsWith("logo-ai-")&&isRasterAiImage(item.candidate.imageUrl)).map((item,index)=>({...item,candidate:{...item.candidate,logoType:item.candidate.logoType||LEGACY_LOGO_TYPES[index%LEGACY_LOGO_TYPES.length]}}));
  const logoIds=new Set(logoCandidates.map(item=>item.id));
  const logoFinal=input.logoProject?.finalLogoId&&logoIds.has(input.logoProject.finalLogoId)?input.logoProject.finalLogoId:undefined;
  const copyPackages=(input.copyProject?.packages||[]).filter(item=>item.id.startsWith("copy-ai-"));
  const copyIds=new Set(copyPackages.map(item=>item.id));
  const copyFinal=input.copyProject?.finalPackage&&(copyIds.has(input.copyProject.finalPackage.id)||(input.copyProject.finalPackage.id.startsWith("final-copy-")&&copyPackages.length>0))?input.copyProject.finalPackage:undefined;
  if(copyFinal)copyIds.add(copyFinal.id);
  const fallbackContainer=containerTypes.find(item=>item.id===input.productDesign?.selectedContainerTypeId)||containerTypes[0];
  const productCandidates=(input.productDesign?.candidates||[]).filter(item=>isRasterAiImage(item.imageUrl)).map(item=>({...item,containerType:item.containerType||{id:fallbackContainer.id,name:fallbackContainer.name,volume:input.productDesign?.selectedVolume||fallbackContainer.volumeOptions[0],dispensingType:fallbackContainer.dispensingType,viewMode:fallbackContainer.viewMode},viewMode:item.viewMode||item.containerType?.viewMode||fallbackContainer.viewMode,copyApplied:item.copyApplied||[],sourceViews:item.sourceViews||[]}));
  const productIds=new Set(productCandidates.map(item=>item.id));
  const productFinal=input.productDesign?.finalDesignId&&productIds.has(input.productDesign.finalDesignId)?input.productDesign.finalDesignId:undefined;
  const packagingCandidates=(input.packagingProject?.candidates||[]).filter(item=>isRasterAiImage(item.previewImageUrl));
  const packagingIds=new Set(packagingCandidates.map(item=>item.id));
  const packagingFinal=input.packagingProject?.finalDesign&&packagingIds.has(input.packagingProject.finalDesign.candidate.id)?input.packagingProject.finalDesign:undefined;
  const marketingItems=(input.marketingImages?.images||[]).filter(item=>isRasterAiImage(item.imageUrl));
  const coreAssetsReady=Boolean(logoFinal&&copyFinal&&productFinal&&packagingFinal);
  const legacyOrCurrentExportComplete=Boolean(
    input.delivery?.projectCompleted||
    input.delivery?.exportRecords?.length||
    (input.completedSteps||[]).includes(7)
  );
  const completed=(input.completedSteps||[]).filter(step=>step===1||(step===2&&logoFinal)||(step===3&&copyFinal)||(step===4&&productFinal)||(step===5&&packagingFinal));
  if(coreAssetsReady&&legacyOrCurrentExportComplete)completed.push(6);
  const normalizedCompleted=[...new Set(completed)].sort();
  const cleanedAssets=(input.brandAssets||[]).filter(asset=>asset.type==="logo"?logoIds.has(asset.candidate.id):copyIds.has(asset.copyPackage.id));
  return {...input,completedSteps:normalizedCompleted,logoProject:input.logoProject?{...input.logoProject,candidates:logoCandidates,deletedCandidates:deletedLogoCandidates,favoriteIds:input.logoProject.favoriteIds.filter(id=>logoIds.has(id)),finalLogoId:logoFinal}:undefined,copyProject:input.copyProject?{...input.copyProject,packages:copyPackages,assembledFields:copyFinal?input.copyProject.assembledFields:{},finalPackage:copyFinal}:undefined,productDesign:input.productDesign?{...input.productDesign,selectedContainerTypeId:input.productDesign.selectedContainerTypeId||(productCandidates.length?fallbackContainer.id:undefined),selectedVolume:input.productDesign.selectedVolume||(productCandidates.length?fallbackContainer.volumeOptions[0]:undefined),structureConfirmed:input.productDesign.structureConfirmed??Boolean(input.productDesign.selectedContainerTypeId&&productCandidates.length),aiRecommendedContainers:input.productDesign.aiRecommendedContainers||[],candidates:productCandidates,favoriteIds:input.productDesign.favoriteIds.filter(id=>productIds.has(id)),finalDesignId:productFinal}:undefined,packagingProject:input.packagingProject?migratePackagingProject({...input.packagingProject,candidates:packagingCandidates,favoriteIds:input.packagingProject.favoriteIds.filter(id=>packagingIds.has(id)),finalDesign:packagingFinal}):undefined,marketingImages:input.marketingImages?{...input.marketingImages,images:marketingItems}:undefined,delivery:normalizedCompleted.includes(6)?input.delivery:input.delivery?{...input.delivery,projectCompleted:false,completedAt:undefined,report:[]}:undefined,brandAssets:cleanedAssets};
}

function migrateProductDesign(input:ProductDesignState):ProductDesignState{
  const referenceIds=(input.designReferenceImages||[]).map(item=>item.id);
  const fidelityFor=(sourceKey:string)=>["logo","brand_name","product_name"].includes(sourceKey)?"exact" as const:["main_slogan","sub_slogan"].includes(sourceKey)?"preserve_meaning" as const:"adaptable" as const;
  return{
    ...emptyProductDesignState(),
    ...input,
    renderVersion:9,
    structureMode:"reference",
    selectedDirections:input.selectedDirections||[],
    candidates:(input.candidates||[]).map((candidate,index)=>{
      const defaults=defaultDirectionSnapshot(index,candidate.directionSnapshot?.referenceImageIds||[]);
      const previous=candidate.directionSnapshot;
      const directionSnapshot=previous?{
        ...defaults,
        ...previous,
        creativeConcept:previous.creativeConcept||candidate.styleDirection||defaults.creativeConcept,
        visualPersonality:previous.visualPersonality||defaults.visualPersonality,
        designRationale:previous.designRationale||defaults.designRationale,
        inspirationSources:previous.inspirationSources||[],
        surfaceCmf:previous.surfaceCmf||{...defaults.surfaceCmf,colors:candidate.cmf.colors||[],graphicLanguage:previous.graphicLanguage||defaults.graphicLanguage,printFinish:previous.materialStrategy||candidate.cmf.finish,sceneDirection:previous.sceneDirection||defaults.sceneDirection},
        typographySystem:previous.typographySystem||defaults.typographySystem,
        copyAdaptations:previous.copyAdaptations||candidate.copyAdaptations||[],
      }:undefined;
      const qualityReview=candidate.qualityReview?{...candidate.qualityReview,layoutCompliant:candidate.qualityReview.layoutCompliant??true,logoConsistent:candidate.qualityReview.logoConsistent??true,logoFidelity:candidate.qualityReview.logoFidelity??candidate.qualityReview.brandQuality,typographyQuality:candidate.qualityReview.typographyQuality??candidate.qualityReview.brandQuality}:undefined;
      return{...candidate,copyLayout:candidate.copyLayout?.map(item=>({...item,fidelity:item.fidelity||fidelityFor(item.sourceKey)})),directionSnapshot,qualityReview};
    }),
    favoriteIds:input.favoriteIds||[],
    finalWarnings:input.finalWarnings||[],
    customContainers:input.customContainers||[],
    aiRecommendedContainers:input.aiRecommendedContainers||[],
    designReferenceImages:input.designReferenceImages||[],
    selectedCopyFieldKeys:[],
    designPrompts:(input.renderVersion===9?input.designPrompts||[]:[]).map((direction,index)=>{
      const defaults=defaultDirectionSnapshot(index,referenceIds.length?[referenceIds[index%referenceIds.length]]:[]);
      const surfaceCmf=direction.surfaceCmf||{...defaults.surfaceCmf,colors:direction.colors||[],graphicLanguage:direction.graphicLanguage||defaults.graphicLanguage,printFinish:direction.materialStrategy||defaults.materialStrategy,sceneDirection:direction.sceneDirection||defaults.sceneDirection};
      return{...defaults,...direction,presentationLayout:fixedProductPresentationLayout,creativeConcept:direction.creativeConcept||direction.name||defaults.creativeConcept,visualPersonality:direction.visualPersonality||direction.summary||defaults.visualPersonality,designRationale:direction.designRationale||defaults.designRationale,inspirationSources:(direction.inspirationSources||[]).filter(source=>source.kind!=="copy"),surfaceCmf:{...surfaceCmf,composition:defaults.surfaceCmf.composition},typographySystem:direction.typographySystem||defaults.typographySystem,copyAdaptations:[],avoidMotifs:direction.avoidMotifs||defaults.avoidMotifs,referenceImageIds:(direction.referenceImageIds||[]).filter(id=>referenceIds.includes(id)).slice(0,3)};
    }),
    copyLayoutPlan:input.copyLayoutPlan?{...input.copyLayoutPlan,items:input.copyLayoutPlan.items.map(item=>({...item,fidelity:item.fidelity||fidelityFor(item.sourceKey)}))}:undefined,
  };
}

function migratePackagingProject(input:PackagingProjectState):PackagingProjectState{
  return{
    ...emptyPackagingProject(),
    ...input,
    promptVersion:3,
    selectedBoxTypeId:aiGeneratedPackagingBoxTypeId,
    uploadedBoxType:undefined,
    structureConfirmed:undefined,
    candidates:input.candidates||[],
    favoriteIds:input.favoriteIds||[],
    promptOptions:[],
    generationPrompt:"",
    generationCount:Math.max(1,Math.min(5,input.generationCount||3)),
  };
}

type ProjectState = {
  brief: DesignBrief;
  completedSteps: number[];
  logoProject: LogoProjectState;
  copyProject: CopyProjectState;
  productDesign: ProductDesignState;
  packagingProject: PackagingProjectState;
  marketingImages: MarketingImageProjectState;
  delivery: DeliveryState;
  brandAssets: BrandAsset[];
};

const createEmptyProjectState = (projectId = `project-${Date.now()}`): ProjectState => ({
  brief: { ...emptyDesignBrief(), projectId },
  completedSteps: [],
  logoProject: emptyLogoProject(),
  copyProject: emptyCopyProject(),
  productDesign: emptyProductDesignState(),
  packagingProject: emptyPackagingProject(),
  marketingImages: emptyMarketingImageProject(),
  delivery: emptyDeliveryState(),
  brandAssets: [],
});

function normalizeProjectState(stored: Partial<ProjectState>): ProjectState {
  const parsed = removeSimulationData(stored);
  return {
    brief: parsed.brief ? importDesignBrief(parsed.brief) : emptyDesignBrief(),
    completedSteps: Array.isArray(parsed.completedSteps)
      ? parsed.completedSteps.filter((step): step is number => Number.isInteger(step) && step >= 1 && step <= 7)
      : [],
    logoProject: parsed.logoProject
      ? { ...emptyLogoProject(), ...parsed.logoProject, candidates: parsed.logoProject.candidates || [], deletedCandidates: parsed.logoProject.deletedCandidates || [], favoriteIds: parsed.logoProject.favoriteIds || [] }
      : emptyLogoProject(),
    copyProject: parsed.copyProject
      ? { ...emptyCopyProject(), ...parsed.copyProject, packages: parsed.copyProject.packages || [], assembledFields: parsed.copyProject.assembledFields || {} }
      : emptyCopyProject(),
    productDesign: parsed.productDesign
      ? migrateProductDesign(parsed.productDesign)
      : emptyProductDesignState(),
    packagingProject: parsed.packagingProject
      ? migratePackagingProject(parsed.packagingProject)
      : emptyPackagingProject(),
    marketingImages: parsed.marketingImages
      ? { ...emptyMarketingImageProject(), ...parsed.marketingImages, selectedTypes: parsed.marketingImages.selectedTypes || [], quantities: { ...emptyMarketingImageProject().quantities, ...(parsed.marketingImages.quantities || {}) }, images: parsed.marketingImages.images || [] }
      : emptyMarketingImageProject(),
    delivery: parsed.delivery
      ? { ...emptyDeliveryState(), ...parsed.delivery, report: parsed.delivery.report || [], exportRecords: parsed.delivery.exportRecords || [], templates: parsed.delivery.templates || [] }
      : emptyDeliveryState(),
    brandAssets: Array.isArray(parsed.brandAssets)
      ? parsed.brandAssets.map((asset) => "type" in asset ? asset : ({ ...(asset as BrandAsset), type: "logo" } as BrandAsset))
      : [],
  };
}

function projectSummary(state: ProjectState, createdAt?: string): StoredProjectSummary {
  const now = new Date().toISOString();
  const brandName = state.brief.brand.name.trim();
  const productName = state.brief.product.name.trim();
  return {
    projectId: state.brief.projectId,
    name: productName || (brandName ? `${brandName} 包装项目` : "未命名项目"),
    brandName,
    productName,
    completedSteps: state.completedSteps,
    completed: state.delivery.projectCompleted,
    createdAt: createdAt || now,
    updatedAt: now,
  };
}

type DesignBriefContextValue = ProjectState & {
  hydrated: boolean;
  storageError?: string;
  projects: StoredProjectSummary[];
  activeProjectId: string;
  createProject: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  setBrief: (brief: DesignBrief) => void;
  importBrief: (json: string | unknown) => DesignBrief;
  completeStep: (step: number) => void;
  updateLogoProject: (updater: (current: LogoProjectState) => LogoProjectState) => void;
  finalizeLogo: (candidateId: string) => void;
  reopenLogoSelection: () => void;
  updateCopyProject: (updater: (current: CopyProjectState) => CopyProjectState) => void;
  finalizeCopy: (copyPackage: CopyPackage) => void;
  reopenCopySelection: () => void;
  updateProductDesign: (updater: (current: ProductDesignState) => ProductDesignState) => void;
  finalizeProductDesign: (candidateId: string, warnings: string[]) => void;
  reopenProductDesign: () => void;
  updatePackagingProject: (updater: (current: PackagingProjectState) => PackagingProjectState) => void;
  finalizePackaging: (candidateId: string) => void;
  reopenPackaging: () => void;
  updateMarketingImages: (updater: (current: MarketingImageProjectState) => MarketingImageProjectState) => void;
  updateQualityReport: (report: QualityCheckItem[]) => void;
  completeExport: (record: ExportRecord) => void;
  saveTemplate: (template: ProjectTemplate) => void;
  applyTemplate: (templateId: string) => void;
};

const DesignBriefContext = createContext<DesignBriefContextValue | null>(null);

export function DesignBriefProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProjectState>(() => createEmptyProjectState());
  const [projects, setProjects] = useState<StoredProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [storageError,setStorageError]=useState<string>();

  useEffect(() => {
    let active=true;
    void (async()=>{
    try {
      await requestPersistentProjectStorage();
      const index = await loadProjectIndex();
      let stored = index?.activeProjectId ? await loadProjectState<Partial<ProjectState>>(index.activeProjectId) : null;
      if(!stored){
        stored=await loadProjectState<Partial<ProjectState>>();
      }
      if(!stored){
        const legacy=localStorage.getItem(LEGACY_STORAGE_KEY);
        if(legacy){stored=JSON.parse(legacy) as Partial<ProjectState>;localStorage.removeItem(LEGACY_STORAGE_KEY);}
      }else{localStorage.removeItem(LEGACY_STORAGE_KEY);}
      if(!active)return;
      if (stored) {
        const normalized = normalizeProjectState(stored);
        const id = normalized.brief.projectId || index?.activeProjectId || `project-${Date.now()}`;
        normalized.brief.projectId = id;
        const existingSummary = index?.projects.find((item) => item.projectId === id);
        const summary = projectSummary(normalized, existingSummary?.createdAt);
        const nextProjects = [summary, ...(index?.projects || []).filter((item) => item.projectId !== id)];
        setState(normalized);
        setActiveProjectId(id);
        setProjects(nextProjects);
        await saveProjectState(normalized, id);
        await saveProjectIndex({ activeProjectId: id, projects: nextProjects });
      } else {
        const fresh = createEmptyProjectState();
        const summary = projectSummary(fresh);
        setState(fresh);
        setActiveProjectId(fresh.brief.projectId);
        setProjects([summary]);
        await saveProjectState(fresh, fresh.brief.projectId);
        await saveProjectIndex({ activeProjectId: fresh.brief.projectId, projects: [summary] });
      }
    } catch(error) {
      if(active)setStorageError(`本地项目读取失败：${error instanceof Error?error.message:"浏览器存储不可用"}`);
    } finally {
      if(active)setHydrated(true);
    }
    })();
    return()=>{active=false;};
  }, []);

  useEffect(() => {
    if (!hydrated || !activeProjectId)return;
    const timer=window.setTimeout(()=>{void (async()=>{try{
      await saveProjectState(state, activeProjectId);
      setProjects((current) => {
        const existing = current.find((item) => item.projectId === activeProjectId);
        const summary = projectSummary(state, existing?.createdAt);
        const next = [summary, ...current.filter((item) => item.projectId !== activeProjectId)];
        void saveProjectIndex({ activeProjectId, projects: next });
        return next;
      });
      setStorageError(undefined);
    }catch(error){setStorageError(error instanceof DOMException&&error.name==="QuotaExceededError"?"项目图片占用空间过大，浏览器磁盘配额不足，请释放磁盘空间后重试。":`项目自动保存失败：${error instanceof Error?error.message:"未知存储错误"}`)}})();},250);
    return()=>window.clearTimeout(timer);
  }, [hydrated, state, activeProjectId]);

  const createProject = useCallback(async () => {
    if (activeProjectId) await saveProjectState(state, activeProjectId);
    const fresh = createEmptyProjectState(`project-${Date.now()}`);
    const currentSummary = activeProjectId ? projectSummary(state, projects.find((item) => item.projectId === activeProjectId)?.createdAt) : null;
    const nextProjects = [projectSummary(fresh), ...(currentSummary ? [currentSummary] : []), ...projects.filter((item) => item.projectId !== activeProjectId)];
    await saveProjectState(fresh, fresh.brief.projectId);
    await saveProjectIndex({ activeProjectId: fresh.brief.projectId, projects: nextProjects });
    setProjects(nextProjects);
    setActiveProjectId(fresh.brief.projectId);
    setState(fresh);
  }, [activeProjectId, projects, state]);

  const switchProject = useCallback(async (projectId: string) => {
    if (!projectId || projectId === activeProjectId) return;
    if (activeProjectId) await saveProjectState(state, activeProjectId);
    const stored = await loadProjectState<Partial<ProjectState>>(projectId);
    if (!stored) throw new Error("历史项目数据不存在或已被浏览器清理");
    const nextState = normalizeProjectState(stored);
    nextState.brief.projectId = projectId;
    const currentSummary = activeProjectId ? projectSummary(state, projects.find((item) => item.projectId === activeProjectId)?.createdAt) : null;
    const targetSummary = projectSummary(nextState, projects.find((item) => item.projectId === projectId)?.createdAt);
    const nextProjects = [targetSummary, ...(currentSummary ? [currentSummary] : []), ...projects.filter((item) => item.projectId !== projectId && item.projectId !== activeProjectId)];
    await saveProjectIndex({ activeProjectId: projectId, projects: nextProjects });
    setProjects(nextProjects);
    setActiveProjectId(projectId);
    setState(nextState);
  }, [activeProjectId, projects, state]);

  const setBrief = useCallback((brief: DesignBrief) => setState((old) => ({ ...old, brief: { ...brief, projectId: old.brief.projectId || activeProjectId || brief.projectId } })), [activeProjectId]);
  const importBrief = useCallback((json: string | unknown) => {
    const parsed = importDesignBrief(json);
    const brief = { ...parsed, projectId: activeProjectId || parsed.projectId };
    setState((old) => ({ ...old, brief }));
    return brief;
  }, [activeProjectId]);
  const completeStep = useCallback((step: number) => {
    setState((old) => ({ ...old, completedSteps: [...new Set([...old.completedSteps, step])].sort() }));
  }, []);
  const updateLogoProject = useCallback((updater: (current: LogoProjectState) => LogoProjectState) => {
    setState((old) => ({ ...old, logoProject: updater(old.logoProject) }));
  }, []);
  const finalizeLogo = useCallback((candidateId: string) => {
    setState((old) => {
      const candidate = old.logoProject.candidates.find((item) => item.id === candidateId);
      if (!candidate) return old;
      const asset: BrandLogoAsset = {
        type: "logo", id: `${old.brief.projectId}:logo`, brandName: old.brief.brand.name || "未命名品牌",
        projectId: old.brief.projectId, candidate, finalizedAt: new Date().toISOString(),
      };
      return {
        ...old,
        logoProject: { ...old.logoProject, finalLogoId: candidateId },
        completedSteps: [...new Set([...old.completedSteps, 2])].sort(),
        brandAssets: [...old.brandAssets.filter((item) => item.id !== asset.id), asset],
      };
    });
  }, []);
  const reopenLogoSelection = useCallback(() => {
    setState((old) => ({
      ...old,
      logoProject: { ...old.logoProject, finalLogoId: undefined },
      completedSteps: old.completedSteps.filter((step) => step !== 2),
      brandAssets: old.brandAssets.filter((item) => !(item.projectId === old.brief.projectId && item.type === "logo")),
    }));
  }, []);
  const updateCopyProject = useCallback((updater: (current: CopyProjectState) => CopyProjectState) => {
    setState((old) => ({ ...old, copyProject: updater(old.copyProject) }));
  }, []);
  const finalizeCopy = useCallback((copyPackage: CopyPackage) => {
    setState((old) => {
      const asset: BrandCopyAsset = {
        type: "copy", id: `${old.brief.projectId}:copy`, brandName: old.brief.brand.name || "未命名品牌",
        projectId: old.brief.projectId, copyPackage, finalizedAt: new Date().toISOString(),
      };
      return {
        ...old,
        copyProject: { ...old.copyProject, finalPackage: copyPackage },
        completedSteps: [...new Set([...old.completedSteps, 3])].sort(),
        brandAssets: [...old.brandAssets.filter((item) => item.id !== asset.id), asset],
      };
    });
  }, []);
  const reopenCopySelection = useCallback(() => {
    setState((old) => ({
      ...old,
      copyProject: { ...old.copyProject, finalPackage: undefined },
      completedSteps: old.completedSteps.filter((step) => step !== 3),
      brandAssets: old.brandAssets.filter((item) => !(item.projectId === old.brief.projectId && item.type === "copy")),
    }));
  }, []);
  const updateProductDesign = useCallback((updater: (current: ProductDesignState) => ProductDesignState) => {
    setState((old) => ({ ...old, productDesign: updater(old.productDesign) }));
  }, []);
  const finalizeProductDesign = useCallback((candidateId: string, warnings: string[]) => {
    setState((old) => old.productDesign.candidates.some((item) => item.id === candidateId) ? {
      ...old,
      productDesign: { ...old.productDesign, finalDesignId: candidateId, finalWarnings: warnings },
      completedSteps: [...new Set([...old.completedSteps, 4])].sort(),
    } : old);
  }, []);
  const reopenProductDesign = useCallback(() => {
    setState((old) => ({
      ...old,
      productDesign: { ...old.productDesign, finalDesignId: undefined, finalWarnings: [] },
      completedSteps: old.completedSteps.filter((step) => step !== 4),
    }));
  }, []);
  const updatePackagingProject = useCallback((updater: (current: PackagingProjectState) => PackagingProjectState) => {
    setState((old) => ({ ...old, packagingProject: updater(old.packagingProject) }));
  }, []);
  const finalizePackaging = useCallback((candidateId: string) => {
    setState((old) => {
      const candidate = old.packagingProject.candidates.find((item) => item.id === candidateId);
      const boxType = candidate?.boxTypeId === aiGeneratedBoxType.id
        ? aiGeneratedBoxType
        : old.packagingProject.uploadedBoxType?.id === candidate?.boxTypeId
          ? old.packagingProject.uploadedBoxType
          : boxTypes.find((item) => item.id === candidate?.boxTypeId) || aiGeneratedBoxType;
      if (!candidate) return old;
      return {
        ...old,
        packagingProject: {
          ...old.packagingProject,
          finalDesign: {
            candidate,
            boxType,
            ...(candidate.renderMode !== "direct_ai_preview" ? { dielineImageUrl: boxType.dielineImageUrl } : {}),
            finalizedAt: new Date().toISOString(),
          },
        },
        completedSteps: [...new Set([...old.completedSteps, 5])].sort(),
      };
    });
  }, []);
  const reopenPackaging = useCallback(() => {
    setState((old) => ({
      ...old,
      packagingProject: { ...old.packagingProject, finalDesign: undefined },
      completedSteps: old.completedSteps.filter((step) => step < 5),
      delivery: { ...old.delivery, projectCompleted: false, completedAt: undefined, report: [] },
    }));
  }, []);
  const updateMarketingImages = useCallback((updater: (current: MarketingImageProjectState) => MarketingImageProjectState) => {
    setState((old) => ({ ...old, marketingImages: updater(old.marketingImages) }));
  }, []);
  const updateQualityReport = useCallback((report: QualityCheckItem[]) => {
    setState((old) => ({ ...old, delivery: { ...old.delivery, report } }));
  }, []);
  const completeExport = useCallback((record: ExportRecord) => {
    setState((old) => ({
      ...old,
      delivery: { ...old.delivery, projectCompleted: true, completedAt: new Date().toISOString(), exportRecords: [record, ...old.delivery.exportRecords] },
      completedSteps: [...new Set([...old.completedSteps.filter((step) => step <= 5), 6])].sort(),
    }));
  }, []);
  const saveTemplate = useCallback((template: ProjectTemplate) => {
    setState((old) => ({ ...old, delivery: { ...old.delivery, templates: [template, ...old.delivery.templates.filter((item) => item.id !== template.id)] } }));
  }, []);
  const applyTemplate = useCallback((templateId: string) => {
    setState((old) => {
      const template = old.delivery.templates.find((item) => item.id === templateId);
      if (!template) return old;
      return {
        ...old,
        productDesign: { ...old.productDesign, selectedDirections: template.styleDirections.slice(0, 3) },
        delivery: { ...old.delivery, activeTemplateId: template.id },
      };
    });
  }, []);

  const value = useMemo(
    () => ({ ...state, hydrated, storageError, projects, activeProjectId, createProject, switchProject, setBrief, importBrief, completeStep, updateLogoProject, finalizeLogo, reopenLogoSelection, updateCopyProject, finalizeCopy, reopenCopySelection, updateProductDesign, finalizeProductDesign, reopenProductDesign, updatePackagingProject, finalizePackaging, reopenPackaging, updateMarketingImages, updateQualityReport, completeExport, saveTemplate, applyTemplate }),
    [state, hydrated, storageError, projects, activeProjectId, createProject, switchProject, setBrief, importBrief, completeStep, updateLogoProject, finalizeLogo, reopenLogoSelection, updateCopyProject, finalizeCopy, reopenCopySelection, updateProductDesign, finalizeProductDesign, reopenProductDesign, updatePackagingProject, finalizePackaging, reopenPackaging, updateMarketingImages, updateQualityReport, completeExport, saveTemplate, applyTemplate],
  );
  return <DesignBriefContext.Provider value={value}>{children}</DesignBriefContext.Provider>;
}

export function useDesignBrief() {
  const context = useContext(DesignBriefContext);
  if (!context) throw new Error("useDesignBrief 必须在 DesignBriefProvider 中使用");
  return context;
}
