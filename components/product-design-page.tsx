"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  compatibleContainerTypes,
  containerCostLabel,
  containerPainResponses,
  containerTypes,
  createStructureSketch,
} from "@/services/container-library";
import type { ContainerType } from "@/types/container";
import {
  productDirectionPreview,
  productImageGenerator,
  productStyleDirections,
} from "@/services/product-image-generator";
import type {
  ProductDesignCandidate,
  ProductCopyFace,
  ProductDesignPromptDirection,
  ProductDirectGenerationStatus,
  ProductImageGenParams,
  ProductViewType,
} from "@/types/product-design";
import { useDesignBrief } from "./design-brief-provider";
import { useAiUsageCount } from "./use-ai-usage-count";
import { productStructureFingerprint, productStructureRecommender } from "@/services/product-structure-recommender";
import { productDesignPromptGenerator } from "@/services/product-design-prompt-generator";
import { inferProductStructureKind, resolveProductViewMode } from "@/services/product-view-mode";
import { defaultDirectionSnapshot, nextDiverseSnapshot, presentationLayoutLabels, snapshotFromDirection, withFixedProductPresentation } from "@/services/product-design-diversity";
import { productDesignQualityReviewer } from "@/services/product-design-quality-reviewer";

const visualVariationOptions: NonNullable<
  ProductImageGenParams["variationHint"]
>[] = ["换配色", "换材质", "更简约", "更精致"];
const swatchColors: Record<string, string> = {
  雾白: "#f3f1e9",
  鼠尾草绿: "#7b9b87",
  岩灰: "#555c58",
  云白: "#e8ebe6",
  苔藓绿: "#496551",
  米杏: "#e9dfca",
  琥珀棕: "#8b5a3c",
  乳白: "#f2eadc",
  冰川蓝: "#b9dce8",
  金属银: "#aeb7bb",
  深海蓝: "#183b50",
  电光青: "#63c8c5",
  象牙白: "#f2eadb",
  香槟金: "#c9a66b",
  曜石黑: "#202321",
  玫瑰金: "#bd8375",
  青瓷绿: "#86a99a",
  月白: "#edf0e8",
  朱砂红: "#a74638",
  墨黑: "#292b29",
};
const fallbackColorHex = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const r = 72 + (hash & 95), g = 72 + ((hash >> 7) & 95), b = 72 + ((hash >> 14) & 95);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
type ProductGenerationJob = {
  id: string;
  directionId: string;
  directionName: string;
  status: ProductDirectGenerationStatus;
  error?: string;
  candidateId?: string;
};
const generationStatusLabel: Record<ProductDirectGenerationStatus, string> = {
  queued: "等待生成",
  preparing_references: "正在整理参考图",
  uploading_references: "正在上传参考图",
  generating: "AI 正在生成",
  completed: "已完成",
  failed: "生成失败",
};
const candidateColors = (candidate: ProductDesignCandidate) => candidate.cmf.colorScheme.map((name) => ({
  name,
  hex: (candidate.cmf.colors?.find((item) => item.name === name)?.hex || swatchColors[name] || fallbackColorHex(name)).toUpperCase(),
}));

function ProductCard({
  candidate,
  number,
  parentNumber,
  favorite,
  final,
  onFavorite,
  onVariant,
  onPreview,
  onRetryView,
  onDelete,
  onRebuild,
  compact,
}: {
  candidate: ProductDesignCandidate;
  number: number;
  parentNumber?: number;
  favorite: boolean;
  final: boolean;
  onFavorite: () => void;
  onVariant: () => void;
  onPreview: () => void;
  onRetryView: (view:ProductViewType) => void;
  onDelete: () => void;
  onRebuild: () => void;
  compact: boolean;
}) {
  const failedViews=(candidate.sourceViews||[]).filter(view=>view.status==="failed");
  return (
    <article
      className={`product-card ${compact ? "is-archived" : ""} ${favorite ? "favorite" : ""} ${final ? "final" : ""}`}
    >
      <div className="product-image-wrap">
        <img src={candidate.imageUrl} alt={`产品设计方案 #${number}`} />
        <span className="product-number">#{number}</span>
        <span className="product-direction-badge">
          {candidate.styleDirection}
        </span>
        {candidate.renderMode === "direct_ai" && <span className="product-direct-badge">AI 直出</span>}
        {candidate.parentId && (
          <span className="product-lineage">
            ↳ 基于方案 #{parentNumber || "-"} · 第 {candidate.round} 轮
          </span>
        )}
        {final && <span className="product-final-badge">✓ 已定稿</span>}
        {compact && <span className="product-archive-badge">24h+ 缩略图</span>}
        <button
          className={`favorite-button ${favorite ? "active" : ""}`}
          type="button"
          onClick={onFavorite}
          aria-label={
            favorite ? `取消收藏产品方案 ${number}` : `收藏产品方案 ${number}`
          }
        >
          {favorite ? "★" : "☆"}
        </button>
      </div>
      <div className="product-card-body">
        <div className="container-spec-line">
          <span>形态</span>
          <strong>
            {candidate.containerType.volume} {candidate.containerType.name}
          </strong>
          <em>{candidate.containerType.dispensingType}</em>
        </div>
        <div className="product-view-chip">
          9:16 完整设计 · {candidate.renderMode==="direct_ai"?"上场景 60% · 下结构视图 40%":candidate.directionSnapshot ? presentationLayoutLabels[candidate.directionSnapshot.presentationLayout] : candidate.viewMode === "two_view" ? "正背视图 + 场景" : "正侧背视图 + 场景"}
        </div>
        {failedViews.length>0&&<div className="product-view-error"><span>视图不完整：{failedViews[0].error}</span>{failedViews.map(view=><button type="button" key={view.type} onClick={()=>onRetryView(view.type)}>补生成{view.type==="front"?"正面":view.type==="side"?"侧面":"背面"}</button>)}</div>}
        {candidate.layoutWarnings?.map(warning=><div className="product-layout-warning" key={warning}>⚠ {warning}</div>)}
        <div className="cmf-block">
          <div className="cmf-title">
            <strong>CMF</strong>
            <span>{candidate.cmf.colorScheme.join(" · ")}</span>
          </div>
          <div className="color-code-list">
            {candidateColors(candidate).map((color) => (
              <span key={color.name}><i style={{ background: color.hex }} /><b>{color.name}</b><code>{color.hex}</code></span>
            ))}
          </div>
          <dl>
            <div>
              <dt>材质</dt>
              <dd>{candidate.cmf.material}</dd>
            </div>
            <div>
              <dt>工艺</dt>
              <dd>{candidate.cmf.finish}</dd>
            </div>
          </dl>
        </div>
        <div className="design-match-list card-ai-explanation">
          {candidate.matchedSellingPoints.map((point) => (
            <p className="selling-match" key={point}>
              <span>✦</span> 呼应卖点：{point}
            </p>
          ))}
          {candidate.avoidedPainPoints.map((pain) => (
            <p className="pain-avoid" key={pain}>
              <span>↗</span> 规避痛点：{pain}
            </p>
          ))}
        </div>
        <div className="product-card-actions">
          <button type="button" onClick={onPreview}>
            查看大图
          </button>
          <button className="delete-product-candidate" type="button" onClick={onDelete}>删除</button>
          <button type="button" onClick={onRebuild}>{candidate.renderMode === "direct_ai" ? "重新生成" : "按 AI 直出重生"}</button>
          <button type="button" onClick={onVariant}>
            生成变体 <span>→</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductDesignPage() {
  const router = useRouter();
  const aiUsageCount = useAiUsageCount("product");
  const {
    brief,
    hydrated,
    completedSteps,
    logoProject,
    productDesign,
    updateProductDesign,
    finalizeProductDesign,
    reopenProductDesign,
  } = useDesignBrief();
  const [generating, setGenerating] = useState(false);
  const [generationJobs, setGenerationJobs] = useState<ProductGenerationJob[]>([]);
  const [notice, setNotice] = useState("");
  const [containerEditing, setContainerEditing] = useState(false);
  const [recommendingStructure,setRecommendingStructure]=useState(false);
  const [structureError,setStructureError]=useState("");
  const [generatingPrompts,setGeneratingPrompts]=useState(false);
  const [variantBase, setVariantBase] = useState<ProductDesignCandidate | null>(
    null,
  );
  const [variation, setVariation] =
    useState<ProductImageGenParams["variationHint"]>();
  const [targetContainerId, setTargetContainerId] = useState("");
  const [targetVolume, setTargetVolume] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  const [preview, setPreview] = useState<ProductDesignCandidate | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [clock, setClock] = useState(() => Date.now());
  const finalLogo = logoProject.candidates.find(
    (item) => item.id === logoProject.finalLogoId,
  );
  const autoContainer=useMemo<ContainerType>(()=>{const base={id:"ai-auto-form",name:"AI 自动设计产品形态",sketchUrl:createStructureSketch("custom","AI 自动设计",5),suitableCategories:[brief.product.category],dispensingType:"根据产品功能与场景自动设计",volumeOptions:[brief.hardConstraints.dimensions||"按品类合理推导"],costLevel:2 as const,materialOptions:["由设计方向确定"],viewMode:"auto" as const,source:"ai" as const,shapeFamily:"custom" as const,description:"不锁定参考器型，由 AI 根据所属产品、功能和使用场景完成合理形态设计",recommendationReason:"无参考器型模式",engineeringVerificationRequired:true};const kind=inferProductStructureKind(brief,base);return{...base,kind,viewMode:kind==="flexible_pack"?"two_view":"three_view"};},[brief]);
  const finalDesign = productDesign.candidates.find(
    (item) => item.id === productDesign.finalDesignId,
  );
  const allContainers = useMemo(
    () => [...(productDesign.customContainers || []), ...(productDesign.aiRecommendedContainers||[]),autoContainer, ...containerTypes],
    [productDesign.customContainers,productDesign.aiRecommendedContainers,autoContainer],
  );
  const selectedContainer = allContainers.find(
    (item) => item.id === productDesign.selectedContainerTypeId,
  );
  const numberOf = (id: string) =>
    productDesign.candidates.findIndex((item) => item.id === id) + 1;
  const favorites = productDesign.favoriteIds.flatMap((id) => {
    const found = productDesign.candidates.find((item) => item.id === id);
    return found ? [found] : [];
  });
  const builtinMatches=useMemo(()=>compatibleContainerTypes(brief,[]),[brief]);
  const currentStructureFingerprint=productStructureFingerprint(brief);
  const rankedContainers = useMemo(
    () => [...(productDesign.customContainers||[]),...(productDesign.aiRecommendedContainers||[]),...builtinMatches].filter((item,index,array)=>array.findIndex(other=>other.id===item.id)===index),
    [builtinMatches,productDesign.customContainers,productDesign.aiRecommendedContainers],
  );
  const candidateCreatedAt = (candidate: ProductDesignCandidate) => {
    const explicit = candidate.createdAt ? Date.parse(candidate.createdAt) : Number.NaN;
    if (Number.isFinite(explicit)) return explicit;
    const legacyTimestamp = candidate.id.match(/^product-(\d{13})/)?.[1];
    return legacyTimestamp ? Number(legacyTimestamp) : 0;
  };
  const visibleCandidates = useMemo(() => productDesign.candidates
    .filter((item) => item.containerType.id === selectedContainer?.id)
    .sort((a, b) => candidateCreatedAt(b) - candidateCreatedAt(a)), [productDesign.candidates, selectedContainer?.id]);
  const groups = useMemo(()=>[...new Set(visibleCandidates.map(item=>item.styleDirection))].map(direction=>({direction,candidates:visibleCandidates.filter(item=>item.styleDirection===direction).sort((a,b)=>b.round-a.round||Number(productDesign.favoriteIds.includes(b.id))-Number(productDesign.favoriteIds.includes(a.id)))})),[visibleCandidates,productDesign.favoriteIds]);
  const structureReady=Boolean(
    productDesign.structureMode==="reference" &&
    selectedContainer?.source==="upload" &&
    productDesign.structureConfirmed,
  );
  const showContainerPicker =
    containerEditing ||
    !selectedContainer ||
    !productDesign.selectedVolume || !productDesign.structureConfirmed ||
    !rankedContainers.some((item) => item.id === selectedContainer.id);

  const requestStructureRecommendations=async(force=false)=>{
    if(recommendingStructure)return;
    const fingerprint=productStructureFingerprint(brief);
    if(!force&&productDesign.structureRecommendationFingerprint===fingerprint&&productDesign.aiRecommendedContainers.length)return;
    setRecommendingStructure(true);setStructureError("");
    try{
      const recommendations=await productStructureRecommender.recommend(brief,4);
      updateProductDesign(current=>({...current,aiRecommendedContainers:recommendations,structureRecommendationFingerprint:fingerprint,structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]}));
    }catch(error){setStructureError(error instanceof Error?error.message:"AI 服务返回未知错误");}
    finally{setRecommendingStructure(false)}
  };
  useEffect(()=>{},[hydrated,builtinMatches.length,currentStructureFingerprint]);
  useEffect(() => {
    if (!hydrated) return;
    const seen = new Set<string>();
    if (!productDesign.candidates.some((item) => seen.has(item.id) || !seen.add(item.id))) return;
    const assigned = new Set<string>();
    updateProductDesign((current) => ({
      ...current,
      candidates: current.candidates.map((item, index) => {
        if (!assigned.has(item.id)) { assigned.add(item.id); return item; }
        const id = `${item.id}-duplicate-${index + 1}`;
        assigned.add(id);
        return { ...item, id };
      }),
    }));
  }, [hydrated, productDesign.candidates, updateProductDesign]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const selectContainer = (id: string) => {
    const container = allContainers.find((item) => item.id === id);
    if (!container) return;
    setContainerEditing(true);
    updateProductDesign((current) => ({
      ...current,
      selectedContainerTypeId: id,
      structureConfirmed:false,
      copyLayoutPlan:undefined,
      selectedVolume:
        current.selectedContainerTypeId === id &&
        container.volumeOptions.includes(current.selectedVolume || "")
          ? current.selectedVolume
          : container.volumeOptions[0],
    }));
  };
  const uploadContainer = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("上传失败：请选择 JPG、PNG、WEBP 或 SVG 图片");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice("上传失败：参考图不能超过 8MB");
      return;
    }
    const imageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("图片读取失败"));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    }).catch((error) => {
      setNotice(
        `上传失败：${error instanceof Error ? error.message : "无法读取图片"}`,
      );
      return "";
    });
    if (!imageUrl) return;
    const custom: ContainerType = {
      id: `custom-container-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, "") || "自定义器材",
      sketchUrl: imageUrl,
      suitableCategories: [brief.product.category],
      dispensingType: "按参考图判断",
      volumeOptions: [brief.hardConstraints.dimensions || "自定义规格"],
      costLevel: 2,
      materialOptions: ["按参考图识别"],
      viewMode: "auto",
      kind:"custom",
      source:"upload",
      shapeFamily:"custom",
      description:"用户上传的产品或结构参考图",
      recommendationReason:"以用户提供的真实结构作为生成约束",
      dimensions:brief.hardConstraints.dimensions,
      engineeringVerificationRequired:true,
      referenceImageUrl:imageUrl,
      isCustom: true,
    };
    updateProductDesign((current) => ({
      ...current,
      structureMode:"reference",
      customContainers: [...(current.customContainers || []), custom],
      selectedContainerTypeId: custom.id,
      selectedVolume: custom.volumeOptions[0],
      structureConfirmed:false,
      copyLayoutPlan:undefined,
      designPrompts:[],
    }));
    setContainerEditing(true);
    setNotice("参考图已上传，正在识别产品形态、材质和建议视图…");
    try{
      const identified=await productStructureRecommender.identify(brief,imageUrl,custom.name);
      updateProductDesign(current=>({...current,structureMode:"reference",customContainers:current.customContainers.map(item=>item.id===custom.id?{...identified,id:custom.id}:item),selectedContainerTypeId:custom.id,selectedVolume:identified.volumeOptions[0],structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]}));
      setNotice("参考图识别完成，请检查并修改结构信息，确认后再生成产品图。");
    }catch(error){
      setNotice(`参考图已保留，但 AI 识别失败：${error instanceof Error?error.message:"服务返回未知错误"}。请手动填写后确认。`);
    }
  };
  const uploadDesignReferences = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const available = Math.max(0, 10 - productDesign.designReferenceImages.length);
    if (!available) { setNotice("视觉参考图最多上传 10 张，请先删除部分图片。"); return; }
    const accepted = files.filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, available);
    if (!accepted.length) { setNotice("上传失败：请选择不超过 8MB 的 JPG、PNG、WEBP 或 SVG 图片。"); return; }
    const images = await Promise.all(accepted.map((file) => new Promise<{ id: string; name: string; dataUrl: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve({ id: `design-reference-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl: reader.result }) : reject(new Error("图片读取失败"));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    })));
    updateProductDesign((current) => ({ ...current, designReferenceImages: [...current.designReferenceImages, ...images].slice(0, 10), designPrompts: [] }));
    setNotice(`已添加 ${images.length} 张视觉参考图，生成提示词和产品图时将一并参考。`);
  };
  const removeDesignReference = (id: string) => updateProductDesign((current) => ({ ...current, designReferenceImages: current.designReferenceImages.filter((item) => item.id !== id), designPrompts: [] }));
  const addManualStructure=()=>{
    const custom:ContainerType={id:`manual-structure-${Date.now()}`,name:"自定义产品形态",sketchUrl:createStructureSketch("custom","自定义产品形态",4),suitableCategories:[brief.product.category],dispensingType:"按实际产品使用方式",volumeOptions:[brief.hardConstraints.dimensions||"按实际产品尺寸"],costLevel:2,materialOptions:["按工程方案确认"],viewMode:"three_view",kind:"custom",source:"manual",shapeFamily:"custom",description:"请填写产品本体或载体的结构特征",recommendationReason:"用户手动创建",dimensions:brief.hardConstraints.dimensions,engineeringVerificationRequired:true,isCustom:true};
    updateProductDesign(current=>({...current,customContainers:[...current.customContainers,custom],selectedContainerTypeId:custom.id,selectedVolume:custom.volumeOptions[0],structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]}));setContainerEditing(true);
  };
  const editSelectedStructure=(patch:Partial<ContainerType>)=>{
    if(!selectedContainer)return;
    updateProductDesign(current=>{
      const existing=[...current.customContainers,...current.aiRecommendedContainers].find(item=>item.id===selectedContainer.id);
      if(existing){const key=existing.source==="ai"?"aiRecommendedContainers":"customContainers";return{...current,[key]:current[key].map(item=>item.id===existing.id?{...item,...patch}:item),structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]};}
      const clone:ContainerType={...selectedContainer,...patch,id:`customized-${selectedContainer.id}-${Date.now()}`,source:"manual",isCustom:true,engineeringVerificationRequired:true};
      return{...current,customContainers:[...current.customContainers,clone],selectedContainerTypeId:clone.id,structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]};
    });
  };
  const toggleDirection = (name: string) =>
    updateProductDesign((current) => {
      const exists = current.selectedDirections.includes(name);
      if (!exists && current.selectedDirections.length >= 3) return current;
      return {
        ...current,
        selectedDirections: exists
          ? current.selectedDirections.filter((item) => item !== name)
          : [...current.selectedDirections, name],
      };
    });
  const generateDesignPrompts = async () => {
    if (generatingPrompts || !finalLogo?.imageUrl || !productDesign.structureMode || !structureReady) return;
    setGeneratingPrompts(true);
    setNotice("");
    try {
      const prompts = await productDesignPromptGenerator.generate({
        brief,
        logoStyleTags: finalLogo.styleTags,
        fixedLogoReference:{id:"fixed-final-logo",name:"定稿 Logo",dataUrl:finalLogo.imageUrl},
        viewMode:resolveProductViewMode(brief,selectedContainer),
        structureMode: productDesign.structureMode,
        container: productDesign.structureMode === "reference" ? selectedContainer : undefined,
        requirement: productDesign.designRequirement,
        count: productDesign.promptDirectionCount,
        referenceImageNames: productDesign.designReferenceImages.map((item) => item.name),
        referenceImages: productDesign.designReferenceImages.map((item) => ({id:item.id,name:item.name,dataUrl:item.dataUrl})),
      });
      updateProductDesign((current) => ({ ...current, designPrompts: prompts }));
      setNotice(`已生成 ${prompts.length} 个可编辑设计提示词。请检查、修改并勾选，确认后再生图。`);
    } catch (error) {
      setNotice(`提示词生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGeneratingPrompts(false);
    }
  };
  const updateDesignPrompt = (id: string, patch: Partial<(typeof productDesign.designPrompts)[number]>) =>
    updateProductDesign((current) => ({
      ...current,
      designPrompts: current.designPrompts.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  const toggleDirectionReference=(directionId:string,imageId:string)=>{
    const direction=productDesign.designPrompts.find(item=>item.id===directionId);if(!direction)return;
    const current=direction.referenceImageIds||[];if(!current.includes(imageId)&&current.length>=3){setNotice("每个方向最多选择 3 张视觉参考图。");return;}
    updateDesignPrompt(directionId,{referenceImageIds:current.includes(imageId)?current.filter(id=>id!==imageId):[...current,imageId]});
  };
  const regenerateDesignPrompt = async (id: string) => {
    const base = productDesign.designPrompts.find((item) => item.id === id);
    if (!base || generatingPrompts || !finalLogo?.imageUrl || !productDesign.structureMode) return;
    setGeneratingPrompts(true);
    setNotice("");
    try {
      const [replacement] = await productDesignPromptGenerator.generate({
        brief,
        logoStyleTags: finalLogo.styleTags,
        fixedLogoReference:{id:"fixed-final-logo",name:"定稿 Logo",dataUrl:finalLogo.imageUrl},
        viewMode:resolveProductViewMode(brief,selectedContainer),
        structureMode: productDesign.structureMode,
        container: productDesign.structureMode === "reference" ? selectedContainer : undefined,
        requirement: `${productDesign.designRequirement}\n请重新设计“${base.name}”方向，必须与原提示词有明显差异。`,
        count: 1,
        referenceImageNames: productDesign.designReferenceImages.map((item) => item.name),
        referenceImages: productDesign.designReferenceImages.map((item) => ({id:item.id,name:item.name,dataUrl:item.dataUrl})),
      });
      updateDesignPrompt(id, { ...replacement, id, selected: true });
      setNotice(`“${base.name}”已重新生成，可继续修改。`);
    } catch (error) {
      setNotice(`提示词重生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGeneratingPrompts(false);
    }
  };
  const updateGenerationJob = (id: string, patch: Partial<ProductGenerationJob>) =>
    setGenerationJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  const startQualityReview=(candidate:ProductDesignCandidate)=>{
    if(!finalLogo?.imageUrl)return;
    void productDesignQualityReviewer.review(candidate,brief,finalLogo.imageUrl,productDesign.candidates.slice(0,3)).then(review=>{
      updateProductDesign(current=>({...current,candidates:current.candidates.map(item=>item.id===candidate.id?{...item,qualityReview:review,qualityReviewStatus:"completed"}:item)}));
    }).catch(()=>{
      updateProductDesign(current=>({...current,candidates:current.candidates.map(item=>item.id===candidate.id?{...item,qualityReviewStatus:"failed"}:item)}));
    });
  };
  const runDirectionJob = async (
    direction: ProductDesignPromptDirection,
    nextRound: number,
    jobId: string,
  ) => {
    if (!finalLogo?.imageUrl || !selectedContainer || !productDesign.selectedVolume) {
      throw new Error("生成依据不完整，请重新确认产品形态");
    }
    const finalViewMode = resolveProductViewMode(brief, selectedContainer);
    const directionIndex=Math.max(0,productDesign.designPrompts.findIndex(item=>item.id===direction.id));
    const directionSnapshot=snapshotFromDirection(direction,directionIndex);
    const selectedReferences=directionSnapshot.referenceImageIds.flatMap(id=>{const image=productDesign.designReferenceImages.find(item=>item.id===id);return image?[{id:image.id,imageUrl:image.dataUrl}]:[]});
    updateGenerationJob(jobId, { status: "preparing_references", error: undefined });
    try {
      const [candidate] = await productImageGenerator.generate({
        brief,
        finalLogo: {
          id: finalLogo.id,
          styleTags: finalLogo.styleTags,
          imageUrl: finalLogo.imageUrl,
          logoType: finalLogo.logoType,
        },
        styleDirection: direction.name,
        customPrompt: direction.promptZh || direction.prompt || direction.summary,
        customColors: direction.colors,
        designDirection:directionSnapshot,
        designReferenceImages:selectedReferences,
        containerTypeId: selectedContainer.id,
        containerType: selectedContainer,
        containerReferenceImageUrl: productDesign.structureMode === "reference" && selectedContainer.source === "upload"
          ? selectedContainer.referenceImageUrl || selectedContainer.sketchUrl
          : undefined,
        containerViewMode: finalViewMode,
        volume: productDesign.selectedVolume,
        count: 1,
        onStatus: (status) => updateGenerationJob(jobId, { status }),
      });
      if (!candidate) throw new Error("图像服务没有返回图片");
      const completed = { ...candidate, createdAt: candidate.createdAt || new Date().toISOString(), round: nextRound, qualityReviewStatus:"pending" as const };
      updateProductDesign((current) => ({
        ...current,
        generationRound: Math.max(current.generationRound, nextRound),
        candidates: [completed, ...current.candidates],
      }));
      updateGenerationJob(jobId, { status: "completed", candidateId: completed.id });
      startQualityReview(completed);
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "服务返回未知错误";
      updateGenerationJob(jobId, { status: "failed", error: message });
      throw error;
    }
  };
  const generateDirections = async () => {
    const confirmedPrompts = productDesign.designPrompts.filter((item) => item.selected && item.prompt.trim());
    if (
      generating ||
      !finalLogo ||
      !selectedContainer ||
      !productDesign.selectedVolume ||
      !structureReady ||
      !confirmedPrompts.length
    )
      return;
    setGenerating(true);
    setNotice("");
    const nextRound = productDesign.generationRound + 1;
    const jobs = confirmedPrompts.map((direction, index) => ({
      id: `product-job-${Date.now()}-${index}`,
      directionId: direction.id,
      directionName: direction.name,
      status: "queued" as const,
    }));
    setGenerationJobs(jobs);
    try {
      let generatedCount = 0;
      const failures: string[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < confirmedPrompts.length) {
          const index = cursor++;
          try {
            await runDirectionJob(confirmedPrompts[index], nextRound, jobs[index].id);
            generatedCount += 1;
            setNotice(`已生成 ${generatedCount}/${confirmedPrompts.length} 张，完成的方案已更新到第一位`);
          } catch (error) {
            failures.push(error instanceof Error ? error.message : "服务返回未知错误");
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, confirmedPrompts.length) }, () => worker()));
      if (!generatedCount) throw new Error(failures[0] || "产品方案生成失败");
      setNotice(failures.length
        ? `已生成 ${generatedCount} 张，另有 ${failures.length} 张失败：${failures[0]}`
        : `已逐张生成 ${generatedCount} 套 ${selectedContainer.name} 产品方案，最新方案位于第一位`);
    } catch (error) {
      setNotice(
        `生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`,
      );
    } finally {
      setGenerating(false);
    }
  };
  const retryGenerationJob = async (job: ProductGenerationJob) => {
    const direction = productDesign.designPrompts.find((item) => item.id === job.directionId);
    if (!direction || generating) return;
    setGenerating(true);
    setNotice("");
    try {
      await runDirectionJob(direction, productDesign.generationRound + 1, job.id);
      setNotice(`“${direction.name}”已重新生成，最新方案位于第一位。`);
    } catch (error) {
      setNotice(`重新生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGenerating(false);
    }
  };
  const openVariant = (candidate: ProductDesignCandidate) => {
    setVariantBase(candidate);
    setVariation(undefined);
    setTargetContainerId("");
    setTargetVolume("");
  };
  const chooseTargetContainer = (id: string) => {
    const container = rankedContainers.find((item) => item.id === id);
    setTargetContainerId(id);
    setTargetVolume(container?.volumeOptions[0] || "");
    setVariation("换器形");
  };
  const generateVariant = async () => {
    if (!variantBase || !variation || generating || !finalLogo?.imageUrl)
      return;
    const base = variantBase;
    const isContainerVariant = variation === "换器形";
    const containerId = isContainerVariant
      ? targetContainerId
      : base.containerType.id;
    const volume = isContainerVariant
      ? targetVolume
      : base.containerType.volume;
    if (!containerId || !volume) return;
    const hint = variation;
    const nextRound = productDesign.generationRound + 1;
    setVariantBase(null);
    setVariation(undefined);
    setGenerating(true);
    const targetContainer = allContainers.find(
      (item) => item.id === containerId,
    );
    const finalViewMode=resolveProductViewMode(brief,targetContainer);
    try {
      const items = await productImageGenerator.generate({
        brief,
        finalLogo: {
          id: finalLogo.id,
          styleTags: finalLogo.styleTags,
          imageUrl: finalLogo.imageUrl,
          logoType: finalLogo.logoType,
        },
        styleDirection: base.styleDirection,
        customPrompt: base.generationPrompt,
        designDirection:base.directionSnapshot,
        designReferenceImages:(base.directionSnapshot?.referenceImageIds||[]).flatMap(id=>{const image=productDesign.designReferenceImages.find(item=>item.id===id);return image?[{id,imageUrl:image.dataUrl}]:[]}),
        containerTypeId: containerId,
        containerType: targetContainer,
        containerReferenceImageUrl: targetContainer?.isCustom
          ? targetContainer.sketchUrl
          : undefined,
        containerViewMode: finalViewMode,
        volume,
        baseDesignId: base.id,
        baseCmf: base.cmf,
        count: variantCount,
        variationHint: hint,
      });
      const pendingItems=items.map(item=>({ ...item, round: nextRound, qualityReviewStatus:"pending" as const }));
      updateProductDesign((current) => ({
        ...current,
        generationRound: nextRound,
        candidates: [
          ...pendingItems,
          ...current.candidates,
        ],
      }));
      pendingItems.forEach(item=>startQualityReview(item));
      setNotice(
        `已基于方案 #${numberOf(base.id)} 生成 ${variantCount} 个“${hint}”变体`,
      );
    } catch (error) {
      setNotice(
        `变体生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`,
      );
    } finally {
      setGenerating(false);
    }
  };
  const retryView=async(candidate:ProductDesignCandidate,view:ProductViewType)=>{
    if(generating||!finalLogo?.imageUrl)return;const container=allContainers.find(item=>item.id===candidate.containerType.id);setGenerating(true);setNotice("");
    try{const updated=await productImageGenerator.regenerateView({brief,finalLogo:{id:finalLogo.id,styleTags:finalLogo.styleTags,imageUrl:finalLogo.imageUrl,logoType:finalLogo.logoType},styleDirection:candidate.styleDirection,designDirection:candidate.directionSnapshot,designReferenceImages:(candidate.directionSnapshot?.referenceImageIds||[]).flatMap(id=>{const image=productDesign.designReferenceImages.find(item=>item.id===id);return image?[{id,imageUrl:image.dataUrl}]:[]}),containerTypeId:candidate.containerType.id,containerType:container,containerReferenceImageUrl:container?.isCustom?container.sketchUrl:undefined,containerViewMode:candidate.viewMode,volume:candidate.containerType.volume,count:1},candidate,view);updateProductDesign(current=>({...current,candidates:current.candidates.map(item=>item.id===candidate.id?updated:item)}));setNotice(`方案 #${numberOf(candidate.id)} 已按 AI 直出模式重新生成完整产品图`)}catch(error){setNotice(`重新生成失败：${error instanceof Error?error.message:"服务返回未知错误"}`)}finally{setGenerating(false)}
  };
  const rebuildCandidate=async(candidate:ProductDesignCandidate,useQualityAdvice=false)=>{
    if(generating||!finalLogo?.imageUrl){return;}
    const container=allContainers.find(item=>item.id===candidate.containerType.id)||selectedContainer;if(!container)return;
    const viewMode=resolveProductViewMode(brief,container);setGenerating(true);setNotice("正在按 AI 直出模式重新生成完整产品图…");
    const baseSnapshot=withFixedProductPresentation(candidate.directionSnapshot||defaultDirectionSnapshot(0,productDesign.designReferenceImages.slice(0,3).map(item=>item.id)));
    const nextSnapshot=withFixedProductPresentation(useQualityAdvice?nextDiverseSnapshot(baseSnapshot,productDesign.designReferenceImages.map(item=>item.id),candidate.qualityReview?.retryHint):baseSnapshot);
    const referenceImages=nextSnapshot.referenceImageIds.flatMap(id=>{const image=productDesign.designReferenceImages.find(item=>item.id===id);return image?[{id,imageUrl:image.dataUrl}]:[]});
    const prompt=[candidate.generationPrompt,"保持器型、尺寸、结构和基础包材；忽略旧提示词中任何左右分栏、自由构图、斜切或嵌入视图要求。固定为上方60%单一商业场景、下方40%结构展示。视觉风格保持开放，但必须强化字体层级、主对齐轴、字距行距、版面网格和图文融合。",useQualityAdvice?`质量检查修正要求：${candidate.qualityReview?.retryHint||"严格执行固定上下版式，提升文字层级、图文融合、场景完成度并降低与近期方案的相似度"}`:""].filter(Boolean).join("\n");
    try{const [rebuilt]=await productImageGenerator.generate({brief,finalLogo:{id:finalLogo.id,styleTags:finalLogo.styleTags,imageUrl:finalLogo.imageUrl,logoType:finalLogo.logoType},styleDirection:candidate.styleDirection,customPrompt:prompt,customColors:candidate.cmf.colors,designDirection:nextSnapshot,designReferenceImages:referenceImages,containerTypeId:container.id,containerType:container,containerReferenceImageUrl:container.isCustom?container.referenceImageUrl||container.sketchUrl:undefined,containerViewMode:viewMode,volume:candidate.containerType.volume,baseDesignId:candidate.id,count:1});if(!rebuilt)throw new Error("服务未返回重生方案");const nextRound=productDesign.generationRound+1;const pending={...rebuilt,round:nextRound,qualityReviewStatus:"pending" as const};updateProductDesign(current=>({...current,generationRound:nextRound,candidates:[pending,...current.candidates]}));startQualityReview(pending);setNotice(`方案 #${numberOf(candidate.id)} 已${useQualityAdvice?"按质量建议差异化":"按新规则"}重生，新方案位于第一位，原方案仍保留。`);}catch(error){setNotice(`重新生成失败：${error instanceof Error?error.message:"服务返回未知错误"}`);}finally{setGenerating(false)}
  };
  const toggleFavorite = (candidate: ProductDesignCandidate) => {
    const exists = productDesign.favoriteIds.includes(candidate.id);
    if (!exists && productDesign.favoriteIds.length >= 5) {
      setNotice("最多收藏 5 个方案，请先取消一个已选方案。");
      return;
    }
    updateProductDesign((current) => ({
      ...current,
      favoriteIds: exists
        ? current.favoriteIds.filter((id) => id !== candidate.id)
        : [...current.favoriteIds, candidate.id],
    }));
  };
  const deleteCandidate = (candidate: ProductDesignCandidate) => {
    if (!window.confirm(`确认删除方案 #${numberOf(candidate.id)}？删除后无法恢复。`)) return;
    updateProductDesign((current) => ({
      ...current,
      candidates: current.candidates.filter((item) => item.id !== candidate.id),
      favoriteIds: current.favoriteIds.filter((id) => id !== candidate.id),
      finalDesignId: current.finalDesignId === candidate.id ? undefined : current.finalDesignId,
      finalWarnings: current.finalDesignId === candidate.id ? [] : current.finalWarnings,
    }));
    setNotice(`方案 #${numberOf(candidate.id)} 已删除。`);
  };
  const validationWarnings = (candidate: ProductDesignCandidate) => {
    const warnings: string[] = [];
    const tags = finalLogo?.styleTags || [];
    if (
      tags.includes("极简") &&
      ["轻奢高端", "东方美学"].includes(candidate.styleDirection)
    )
      warnings.push("Logo 为极简风格，当前方向装饰性较强，建议复核视觉复杂度");
    if (
      (tags.includes("自然") || tags.includes("有机")) &&
      candidate.styleDirection === "科技实验室"
    )
      warnings.push("Logo 偏自然语汇，与科技实验室方向存在调性差异");
    if (
      (tags.includes("科技感") || tags.includes("几何")) &&
      candidate.styleDirection === "自然植萃"
    )
      warnings.push("Logo 偏科技几何，需确认与自然植萃材质的融合方式");
    if (brief.hardConstraints.dimensions)
      warnings.push(
        `需工程验证尺寸可行性：${brief.hardConstraints.dimensions}`,
      );
    return warnings;
  };
  const finalize = (candidate: ProductDesignCandidate) => {
    const failed=(candidate.sourceViews||[]).filter(view=>view.status!=="ready");
    if(failed.length){setNotice(`该方案视图不完整，暂不能定稿：${failed.map(view=>view.type==="front"?"正面":view.type==="side"?"侧面":"背面").join("、")}`);return;}
    if(candidate.qualityReviewStatus==="completed"&&candidate.qualityReview?.layoutCompliant===false){setNotice("该方案未通过固定上下版式检查，请先点击“按固定上下版式重生”。");return;}
    if(candidate.qualityReviewStatus==="completed"&&candidate.qualityReview?.informationComplete===false){setNotice("该方案的信息设计不符合当前产品品类与器型：请重新生成，使主识别面和辅助信息面达到该产品应有的完整度。");return;}
    finalizeProductDesign(candidate.id, validationWarnings(candidate));
  };

  if (!hydrated)
    return (
      <div className="form-loading">
        <span />
        <p>正在载入产品设计项目…</p>
      </div>
    );
  if (!completedSteps.includes(3) || !finalLogo)
    return (
      <div className="placeholder-page">
        <span className="eyebrow">STEP 4 / 6</span>
        <h1>请先完成前序流程</h1>
        <p>产品概念设计只需要读取第 2 步的定稿 Logo；第 3 步文案不会约束本步生图。</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => router.push("/workflow/3")}
        >
          返回第 3 步
        </button>
      </div>
    );

  return (
    <>
      <div className="page-heading product-heading">
        <div>
          <span className="eyebrow">STEP 4 / 6</span>
          <h1>产品图设计</h1>
          <p>先确认适合当前品类的产品形态或载体，再探索配色、材质与工艺方案。</p>
        </div>
        <span className="mock-badge">生成调用 {aiUsageCount} 次</span>
      </div>

      <section className="design-basis-card">
        <div className="logo-section-head">
          <div>
            <span>01</span>
            <div>
              <h2>设计依据</h2>
              <p>品牌与产品信息仅用于理解设计背景；包装文字由 AI 自由完成</p>
            </div>
          </div>
        </div>
        <div className="design-basis-grid">
          <div>
            <small>品牌</small>
            <strong>{brief.brand.name}</strong>
          </div>
          <div>
            <small>产品</small>
            <strong>{brief.product.name}</strong>
          </div>
          <div>
            <small>品类</small>
            <strong>{brief.product.industry} · {brief.product.category}</strong>
          </div>
          <div>
            <small>核心卖点</small>
            <p>
              {brief.product.coreSellingPoints.map((item) => (
                <span key={item.point}>{item.point}</span>
              ))}
            </p>
          </div>
        </div>
      </section>

      <section className="container-selector">
        <div className="structure-mode-workflow">
          <div className="workflow-intro">
            <span>02</span>
            <div>
              <h2>上传产品或器型参考图</h2>
              <p>默认以你上传的产品、包材或结构照片为器型依据；AI 识别后可修改名称、尺寸与视图，再确认进入生图。</p>
            </div>
          </div>
          <div className="reference-structure-panel">
            <label className="reference-upload-button">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => void uploadContainer(event)} />
              <span>＋</span>
              <div><strong>{selectedContainer?.source === "upload" ? "重新上传参考图" : "上传产品或器型参考图"}</strong><small>JPG / PNG / WEBP / SVG，最大 8MB</small></div>
            </label>
            {selectedContainer?.source === "upload" ? (
              <div className="reference-structure-editor">
                <img src={selectedContainer.referenceImageUrl || selectedContainer.sketchUrl} alt="已上传的产品器型参考图" />
                <div className="reference-fields">
                  <label>结构名称<input value={selectedContainer.name} onChange={(event) => editSelectedStructure({ name: event.target.value })} /></label>
                  <label>规格 / 尺寸<input value={productDesign.selectedVolume || ""} onChange={(event) => updateProductDesign((current) => ({ ...current, structureMode:"reference", selectedVolume: event.target.value, structureConfirmed: false, copyLayoutPlan:undefined, designPrompts: [] }))} /></label>
                  <label className="wide">结构说明<textarea value={selectedContainer.description || ""} onChange={(event) => editSelectedStructure({ description: event.target.value })} /></label>
                  <fieldset><legend>视图</legend><button type="button" className={selectedContainer.viewMode === "two_view" ? "active" : ""} onClick={() => editSelectedStructure({ viewMode: "two_view" })}>正面 + 背面</button><button type="button" className={selectedContainer.viewMode !== "two_view" ? "active" : ""} onClick={() => editSelectedStructure({ viewMode: "three_view" })}>正面 + 侧面 + 背面</button></fieldset>
                  <button className="confirm-reference-button" type="button" disabled={!selectedContainer.name.trim() || !productDesign.selectedVolume?.trim()} onClick={() => { updateProductDesign((current) => ({ ...current, structureMode:"reference", structureConfirmed: true, designPrompts: [] })); setContainerEditing(false); }}>确认使用此参考器型</button>
                </div>
              </div>
            ) : <p className="reference-empty">请先上传参考图。AI 会识别产品形态、材质和建议视图；确认前不会进入提示词或生图。</p>}
          </div>
        </div>
        <div className="logo-section-title">
          <div>
            <span>02</span>
            <div>
              <h2>选择产品形态与规格</h2>
              <p>
                优先展示与“{brief.product.category}”严格适配的结构；无匹配时由 AI 给出概念建议
              </p>
            </div>
          </div>
          {selectedContainer && !showContainerPicker && <b>已选择</b>}
        </div>
        {showContainerPicker ? (
          <>
            <div className={`container-match-note ${builtinMatches.length?"":"warning"}`}>
              <div>{builtinMatches.length?`找到 ${builtinMatches.length} 个内置适配结构，已隐藏不相关形态。`:`内置库暂无“${brief.product.category}”的匹配结构。可使用 AI 推荐、上传参考图或手动创建，页面不会强行套用瓶罐器形。`}</div>
              <button type="button" disabled={recommendingStructure} onClick={()=>void requestStructureRecommendations(true)}>{recommendingStructure?"AI 正在分析…":builtinMatches.length?"AI 补充更多建议":"重新获取 AI 建议"}</button>
            </div>
            {structureError&&<div className="structure-error"><strong>AI 推荐失败</strong><span>{structureError}</span><button type="button" onClick={()=>void requestStructureRecommendations(true)}>重试</button></div>}
            {recommendingStructure&&<div className="structure-loading">正在根据产品名称、品类、尺寸和使用场景分析合适形态…</div>}
            <div className="container-card-grid">
              {rankedContainers.map((container, index) => {
                const selected =
                  container.id === productDesign.selectedContainerTypeId;
                const responses = containerPainResponses(container, brief);
                const categoryMatch = !container.isCustom && container.suitableCategories.some(
                  (item) =>
                    brief.product.category.includes(item) ||
                    item.includes(brief.product.category),
                );
                return (
                  <article
                    className={`container-card ${selected ? "selected" : ""}`}
                    key={container.id}
                    onClick={() => selectContainer(container.id)}
                  >
                    <div className="container-sketch">
                      <img
                        src={container.sketchUrl}
                        alt={`${container.name}结构示意`}
                      />
                      {container.source==="ai"?<span>AI 建议</span>:container.source==="upload"?<span>上传参考</span>:container.source==="manual"?<span>自定义</span>:categoryMatch && index < 3 && <span>适配</span>}
                    </div>
                    <div className="container-card-body">
                      <div className="container-card-title">
                        <h3>{container.name}</h3>
                        <em className={`cost-${container.costLevel}`}>
                          {containerCostLabel(container.costLevel)}成本
                        </em>
                      </div>
                      <dl>
                        <div>
                          <dt>{container.kind==="solid_product"?"使用方式":"取用/使用"}</dt>
                          <dd>{container.dispensingType}</dd>
                        </div>
                        <div>
                          <dt>常见材质</dt>
                          <dd>{container.materialOptions.join(" / ")}</dd>
                        </div>
                      </dl>
                      <label>
                        容量规格
                        <select
                          value={
                            selected
                              ? productDesign.selectedVolume ||
                                container.volumeOptions[0]
                              : container.volumeOptions[0]
                          }
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            selectContainer(container.id);
                            updateProductDesign((current) => ({
                              ...current,
                              selectedVolume: event.target.value,
                            }));
                          }}
                        >
                          {container.volumeOptions.map((volume) => (
                            <option key={volume}>{volume}</option>
                          ))}
                        </select>
                      </label>
                      {container.description&&<p className="structure-description">{container.description}</p>}
                      {container.recommendationReason&&<p className="structure-reason">推荐依据：{container.recommendationReason}</p>}
                      {container.engineeringVerificationRequired&&<span className="engineering-tag">生产前需工程验证</span>}
                      {responses.map((response) => (
                        <span
                          className="container-pain-response"
                          key={response}
                        >
                          ↗ 可回应痛点：{response}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
              <label className="custom-container-upload">
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event)=>void uploadContainer(event)}/>
                <span>＋</span>
                <strong>上传产品或结构参考图</strong>
                <p>支持 JPG / PNG / WEBP / SVG，上传后可继续修改名称、规格、材质和视图</p>
                <small>生成时锁定参考结构</small>
              </label>
              <button type="button" className="manual-structure-card" onClick={addManualStructure}><span>＋</span><strong>手动创建产品形态</strong><p>没有参考图也可以填写产品本体、载体或结构描述</p><small>适合特殊设备、家居、文具和全新品类</small></button>
            </div>
            {selectedContainer&&<div className="structure-editor"><div className="structure-editor-head"><div><strong>确认前可修改</strong><span>AI 与内置建议均可按实际产品调整</span></div><em>生产前需工程验证</em></div><div className="structure-editor-grid"><label>结构名称<input value={selectedContainer.name} onChange={event=>editSelectedStructure({name:event.target.value})}/></label><label>规格/尺寸<input value={productDesign.selectedVolume||""} onChange={event=>updateProductDesign(current=>({...current,selectedVolume:event.target.value,structureConfirmed:false,copyLayoutPlan:undefined,designPrompts:[]}))}/></label><label>材质<input value={selectedContainer.materialOptions.join(" / ")} onChange={event=>editSelectedStructure({materialOptions:event.target.value.split(/[、/，,]/).map(item=>item.trim()).filter(Boolean)})}/></label><label>使用或取用方式<input value={selectedContainer.dispensingType} onChange={event=>editSelectedStructure({dispensingType:event.target.value})}/></label><label className="wide">结构描述<textarea value={selectedContainer.description||""} onChange={event=>editSelectedStructure({description:event.target.value})}/></label><fieldset><legend>视图数量</legend><button type="button" className={selectedContainer.viewMode==="two_view"?"active":""} onClick={()=>editSelectedStructure({viewMode:"two_view"})}>正面 + 背面</button><button type="button" className={selectedContainer.viewMode!=="two_view"?"active":""} onClick={()=>editSelectedStructure({viewMode:"three_view"})}>正面 + 侧面 + 背面</button></fieldset></div></div>}
            <div className="container-confirm-row">
              <span>
                {selectedContainer
                  ? `待确认：${selectedContainer.name} · ${productDesign.selectedVolume}`
                  : "请选择 1 个产品形态和规格"}
              </span>
              <button
                className="primary-button"
                type="button"
                disabled={!selectedContainer || !selectedContainer.name.trim() || !productDesign.selectedVolume?.trim() || !rankedContainers.some(item=>item.id===selectedContainer.id)}
                onClick={() => {updateProductDesign(current=>({...current,structureConfirmed:true}));setContainerEditing(false)}}
              >
                确认产品形态，选择风格 →
              </button>
            </div>
          </>
        ) : (
          selectedContainer && (
            <div className="selected-container-summary">
              <img
                src={selectedContainer.sketchUrl}
                alt={`${selectedContainer.name}示意图`}
              />
              <div>
                <span>已确认产品形态</span>
                <h3>
                  {productDesign.selectedVolume} · {selectedContainer.name}
                </h3>
              <p>
                {selectedContainer.dispensingType} ·{" "}
                {selectedContainer.materialOptions.join(" / ")} ·{" "}
                {containerCostLabel(selectedContainer.costLevel)}成本
              </p>
              <small>{selectedContainer.viewMode==="two_view"?"输出正面 + 背面":selectedContainer.viewMode==="three_view"?"输出正面 + 侧面 + 背面":"由 AI 判断输出 2 或 3 视图"}</small>
              </div>
              <button type="button" onClick={() => setContainerEditing(true)}>
                更换或修改形态
              </button>
            </div>
          )
        )}
      </section>

      {structureReady && selectedContainer && (
        <section className="direction-selector">
          <div className="logo-section-title">
            <div>
              <span>03</span>
              <div>
                <h2>生成并选择设计提示词</h2>
                <p>
                  {productDesign.structureMode === "reference" ? `固定 ${productDesign.selectedVolume} ${selectedContainer.name} 器型，先规划视觉方案再生图` : "先由 AI 规划产品形态与视觉方案，确认提示词后再生图"}
                </p>
              </div>
            </div>
            <b>{productDesign.designPrompts.filter((item) => item.selected).length}/{productDesign.designPrompts.length || productDesign.promptDirectionCount}</b>
          </div>
          <div className="product-prompt-workbench">
            <div className="design-requirement-row">
              <div className="design-requirement-field">
                <span><strong>产品设计要求</strong><em>可选，可自行修改</em></span>
                <textarea
                  value={productDesign.designRequirement}
                  onChange={(event) => updateProductDesign((current) => ({ ...current, designRequirement: event.target.value, designPrompts: [] }))}
                  placeholder="例如：希望整体年轻、便携，奶油白搭配珊瑚橙；正面保留品牌、产品名和主标语，避免廉价塑料感。"
                />
                <div className="design-reference-zone">
                  <div><strong>固定 Logo 与视觉参考</strong><span>用户参考 {productDesign.designReferenceImages.length}/10</span></div>
                  <div className="design-reference-strip">
                    <figure className="fixed-logo-reference">
                      <img src={finalLogo.imageUrl} alt="定稿 Logo 固定参考" title="定稿 Logo · 每个方向必用"/>
                      <figcaption><span>🔒</span>定稿 Logo · 必用</figcaption>
                    </figure>
                    {productDesign.designReferenceImages.map((image) => <figure key={image.id}><img src={image.dataUrl} alt={image.name} title={image.name}/><button type="button" aria-label={`删除参考图 ${image.name}`} onClick={() => removeDesignReference(image.id)}>×</button></figure>)}
                    {productDesign.designReferenceImages.length < 10 && <label className="design-reference-add"><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => void uploadDesignReferences(event)}/><b>＋</b><small>上传参考图</small></label>}
                  </div>
                  <p>定稿 Logo 不可删除、不计入 10 张额度，并自动进入每个方向和每次生图。其他图片仅用于参考配色、材质、图案与整体气质。</p>
                </div>
              </div>
              <div className="prompt-count-picker">
                <strong>生成几种提示词方案</strong>
                <span>一次可选 1–5 种</span>
                <div>{[1, 2, 3, 4, 5].map((count) => <button type="button" key={count} className={productDesign.promptDirectionCount === count ? "active" : ""} onClick={() => updateProductDesign((current) => ({ ...current, promptDirectionCount: count, designPrompts: [] }))}>{count}</button>)}</div>
              </div>
              <button className="generate-prompts-button" type="button" disabled={generatingPrompts || !structureReady} onClick={() => void generateDesignPrompts()}>{generatingPrompts ? "AI 正在规划…" : `AI 生成 ${productDesign.promptDirectionCount} 种设计提示词`}</button>
            </div>
            {productDesign.designPrompts.length ? (
              <div className="design-prompt-list">
                {productDesign.designPrompts.map((direction, index) => {
                  const snapshot=snapshotFromDirection(direction,index);
                  return (
                  <article className={direction.selected ? "selected" : ""} key={direction.id}>
                    <header><label><input type="checkbox" checked={direction.selected} onChange={(event) => updateDesignPrompt(direction.id, { selected: event.target.checked })} /><span>用于生图</span></label><div><em className="prompt-reference-badge">Logo 必用{snapshot.referenceImageIds.length?` · 另选 ${snapshot.referenceImageIds.length} 张`:""}</em><b>方向 {index + 1}</b></div></header>
                    <label>方向名称<input value={direction.name} onChange={(event) => updateDesignPrompt(direction.id, { name: event.target.value })} /></label>
                    <label>设计概述<input value={direction.summary} onChange={(event) => updateDesignPrompt(direction.id, { summary: event.target.value })} /></label>
                    {direction.colors?.length ? <div className="prompt-palette"><strong>方案色板</strong>{direction.colors.map((color) => <span key={`${color.name}-${color.hex}`}><i style={{ background: color.hex }} />{color.name}<code>{color.hex}</code></span>)}</div> : null}
                    {productDesign.designReferenceImages.length>0&&<div className="direction-reference-picker"><strong>本方向视觉参考 <em>可选 0–3 张</em></strong><div>{productDesign.designReferenceImages.map(image=>{const active=snapshot.referenceImageIds.includes(image.id);return <button key={image.id} type="button" className={active?"active":""} onClick={()=>toggleDirectionReference(direction.id,image.id)} aria-label={`${active?"取消":"选择"}参考图 ${image.name}`}><img src={image.dataUrl} alt={image.name}/><span>{active?"✓":"+"}</span></button>})}</div></div>}
                    <label className="prompt-language prompt-zh"><span>中文生图提示词 <em>确认或修改后直接用于生图</em></span><textarea value={direction.promptZh || direction.prompt || direction.summary} onChange={(event) => { const promptZh = event.target.value; updateDesignPrompt(direction.id, { promptZh, prompt: promptZh, promptEn: undefined }); }} /></label>
                    <footer><span>你可以直接修改，保存后按当前文本生图。</span><button type="button" disabled={generatingPrompts} onClick={() => void regenerateDesignPrompt(direction.id)}>重新生成此方向</button></footer>
                  </article>
                )})}
              </div>
            ) : <div className="prompt-empty-state">先填写设计要求并生成提示词。提示词会完整展示给你，不会自动扣图像生成次数。</div>}
            <div className="confirmed-prompt-actions">
              <span>已选择 {productDesign.designPrompts.filter((item) => item.selected && item.prompt.trim()).length} 个方向 · 每个方向仅调用 1 次 AI，完成一张即立即展示</span>
              <div className="prompt-batch-select"><button type="button" onClick={() => updateProductDesign((current) => ({ ...current, designPrompts: current.designPrompts.map((item) => ({ ...item, selected: true })) }))}>全选</button><button type="button" onClick={() => updateProductDesign((current) => ({ ...current, designPrompts: current.designPrompts.map((item) => ({ ...item, selected: false })) }))}>清空</button></div>
              <button className="primary-button" type="button" disabled={generating || !productDesign.designPrompts.some((item) => item.selected && item.prompt.trim())} onClick={() => void generateDirections()}>{generating ? "正在生成完整产品图…" : `确认提示词并生成 ${productDesign.designPrompts.filter((item) => item.selected && item.prompt.trim()).length} 张图`}</button>
            </div>
            <p className="direct-ai-risk-note">AI 直出适合概念设计展示，不作为印刷准确文件；请在大图中逐项核对品牌名、数字与文案。</p>
          </div>
          <div className="direction-card-grid legacy-direction-ui">
            {productStyleDirections.map((direction) => {
              const selected = productDesign.selectedDirections.includes(
                direction.name,
              );
              const audience =
                brief.consumer.ageRange || brief.product.targetMarket;
              return (
                <button
                  className={`direction-card ${selected ? "selected" : ""}`}
                  type="button"
                  key={direction.name}
                  onClick={() => toggleDirection(direction.name)}
                >
                  <div className="direction-image">
                    <img
                        src={productDirectionPreview(direction.name,selectedContainer,productDesign.selectedVolume||selectedContainer.volumeOptions[0])}
                      alt={`${direction.name}情绪示意`}
                    />
                    <span>{selected ? "✓ 已选择" : "选择方向"}</span>
                  </div>
                  <div>
                    <h3>{direction.name}</h3>
                    <p>
                      {direction.baseDescription}
                      {audience ? ` 适配 ${audience} 的审美偏好。` : ""}
                    </p>
                    <small>{direction.keywords.join(" · ")}</small>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="product-generation-controls legacy-direction-ui">
            <div>
              <strong>每个方向生成套数</strong>
              <span>可选 1–4 套，每套最终输出 1 张 9:16 完整设计长图</span>
            </div>
            <div className="product-count-options">
              {[1, 2, 3, 4].map((count) => (
                <button
                  type="button"
                  className={
                    productDesign.generationCount === count ? "active" : ""
                  }
                  key={count}
                  onClick={() =>
                    updateProductDesign((current) => ({
                      ...current,
                      generationCount: count,
                    }))
                  }
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="direction-actions legacy-direction-ui">
            <span>
              {productDesign.selectedDirections.length
                ? `预计生成 ${productDesign.selectedDirections.length * productDesign.generationCount} 套；每套上方为结构视图，下方为高质量商业效果图`
                : "请选择至少 1 个风格方向"}
            </span>
            <button
              className="primary-button"
              type="button"
              disabled={!productDesign.selectedDirections.length || generating}
              onClick={() => void generateDirections()}
            >
              {generating
                ? "正在生成…"
                : `✦ 生成 ${productDesign.selectedDirections.length * productDesign.generationCount} 个产品方案`}
            </button>
          </div>
        </section>
      )}

      <section className="product-solution-section">
        <div className="logo-section-title">
          <div>
            <span>04</span>
            <div>
              <h2>产品方案探索</h2>
              <p>
                {visibleCandidates.length
                  ? `${visibleCandidates.length} 套当前器型方案 · ${productDesign.generationRound} 轮迭代`
                  : "确认产品形态并选择提示词后生成产品方案"}
              </p>
            </div>
          </div>
        </div>
        {notice && (
          <div
            className={`product-notice ${/失败/.test(notice) ? "error" : ""}`}
          >
            {notice}
          </div>
        )}
        {generationJobs.length > 0 && (
          <div className="product-generation-jobs" aria-label="产品图生成进度">
            {generationJobs.map((job) => (
              <article className={`product-generation-job is-${job.status}`} key={job.id}>
                <span className="job-status-dot" />
                <div><strong>{job.directionName}</strong><small>{generationStatusLabel[job.status]}</small>{job.error && <p>{job.error}</p>}</div>
                {job.status === "failed" && <button type="button" disabled={generating} onClick={() => void retryGenerationJob(job)}>只重试这张</button>}
              </article>
            ))}
          </div>
        )}
        {generating && !productDesign.candidates.length ? (
          <div className="product-loading-grid">
            {Array.from({
              length: Math.max(
                1,
                productDesign.selectedDirections.length *
                  productDesign.generationCount,
              ),
            }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : groups.length ? (
            <div className="product-grid product-grid-all-directions">
                {visibleCandidates.map((candidate) => (
                  <ProductCard
                    key={candidate.id}
                    candidate={candidate}
                    number={numberOf(candidate.id)}
                    parentNumber={
                      candidate.parentId
                        ? numberOf(candidate.parentId)
                        : undefined
                    }
                    favorite={productDesign.favoriteIds.includes(candidate.id)}
                    final={productDesign.finalDesignId === candidate.id}
                    onFavorite={() => toggleFavorite(candidate)}
                    onVariant={() => openVariant(candidate)}
                    onPreview={() => { setPreviewZoom(1); setPreview(candidate); }}
                    onRetryView={(view)=>void retryView(candidate,view)}
                    onDelete={() => deleteCandidate(candidate)}
                    onRebuild={() => void rebuildCandidate(candidate)}
                    compact={clock - candidateCreatedAt(candidate) >= 24 * 60 * 60 * 1000}
                  />
                ))}
            </div>
        ) : (
          <div className="product-empty">
            <span>◫</span>
            <p>尚未生成产品方案</p>
            <small>先从上方确认产品形态，再选择风格方向。</small>
          </div>
        )}
      </section>

      <section className="product-selected-section">
        <div className="logo-section-title">
          <div>
            <span>05</span>
            <div>
              <h2>已选方案与定稿</h2>
              <p>确定产品形态、规格与完整 CMF 方案</p>
            </div>
          </div>
          <b>{favorites.length}/5</b>
        </div>
        {finalDesign ? (
          <div className="final-product">
            <img src={finalDesign.imageUrl} alt="定稿产品设计" />
            <div className="final-product-copy">
              <span className="eyebrow">FINAL PRODUCT DESIGN</span>
              <h3>
                方案 #{numberOf(finalDesign.id)} ·{" "}
                {finalDesign.containerType.volume}{" "}
                {finalDesign.containerType.name}
              </h3>
              <p>
                {finalDesign.containerType.dispensingType} ·{" "}
                {finalDesign.cmf.material} ·{" "}
                {finalDesign.cmf.colorScheme.join(" / ")} ·{" "}
                {finalDesign.cmf.finish}
              </p>
              <div className="validation-tags">
                {productDesign.finalWarnings.length ? (
                  productDesign.finalWarnings.map((warning) => (
                    <span key={warning}>! {warning}</span>
                  ))
                ) : (
                  <span className="pass">✓ 与 Logo 风格一致</span>
                )}
              </div>
            </div>
            <div className="final-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "重新选择将撤销当前产品设计定稿。确认继续吗？",
                    )
                  )
                    reopenProductDesign();
                }}
              >
                重新选择
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => router.push("/workflow/5")}
              >
                进入外包装设计 <span>→</span>
              </button>
            </div>
          </div>
        ) : favorites.length ? (
          <div className="selected-product-grid">
            {favorites.map((candidate) => (
              <article key={candidate.id}>
                <img
                  src={candidate.imageUrl}
                  alt={`已选产品方案 #${numberOf(candidate.id)}`}
                />
                <div>
                  <strong>
                    方案 #{numberOf(candidate.id)} ·{" "}
                    {candidate.containerType.volume}{" "}
                    {candidate.containerType.name}
                  </strong>
                  <p>
                    {candidate.cmf.colorScheme.join(" / ")} ·{" "}
                    {candidate.cmf.material}
                  </p>
                </div>
                <button type="button" onClick={() => openVariant(candidate)}>
                  生成变体
                </button>
                <button
                  className="finalize-button"
                  type="button"
                  disabled={candidate.qualityReviewStatus==="completed"&&candidate.qualityReview?.layoutCompliant===false}
                  title={candidate.qualityReviewStatus==="completed"&&candidate.qualityReview?.layoutCompliant===false?"请先按固定上下版式重生":"定稿当前产品方案"}
                  onClick={() => finalize(candidate)}
                >
                  定稿
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-selected">
            <span>☆</span>
            <p>还没有收藏产品方案</p>
            <small>点击方案右上角星标，将候选加入这里。</small>
          </div>
        )}
      </section>

      {variantBase && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !generating)
              setVariantBase(null);
          }}
        >
          <section
            className="product-variant-modal product-variant-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-variant-title"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">PRODUCT VARIATION</span>
                <h2 id="product-variant-title">
                  基于方案 #{numberOf(variantBase.id)} 生成变体
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setVariantBase(null)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="product-variant-preview">
              <img src={variantBase.imageUrl} alt="产品变体基底" />
              <div>
                <strong>
                  {variantBase.containerType.volume}{" "}
                  {variantBase.containerType.name} ·{" "}
                  {variantBase.styleDirection}
                </strong>
                <p>
                  {variantBase.cmf.colorScheme.join(" · ")} /{" "}
                  {variantBase.cmf.material}
                </p>
                <small>变体将保留来源谱系</small>
              </div>
            </div>
            <div className="variation-section">
              <div>
                <strong>视觉变体</strong>
                <span>保留当前产品形态</span>
              </div>
              <div className="product-variation-options visual">
                {visualVariationOptions.map((item) => (
                  <button
                    className={variation === item ? "active" : ""}
                    type="button"
                    key={item}
                    onClick={() => {
                      setVariation(item);
                      setTargetContainerId("");
                      setTargetVolume("");
                    }}
                  >
                    <span>
                      {item === "换配色"
                        ? "◐"
                        : item === "换材质"
                          ? "▧"
                          : item === "更简约"
                            ? "—"
                            : "✦"}
                    </span>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="variation-section container-variation-section">
              <div>
                <strong>形态变体</strong>
                <span>保留当前配色与材质</span>
              </div>
              <div className="container-variant-controls">
                <select
                  value={targetContainerId}
                  onChange={(event) =>
                    chooseTargetContainer(event.target.value)
                  }
                >
                  <option value="">选择目标产品形态</option>
                  {rankedContainers
                    .filter((item) => item.id !== variantBase.containerType.id)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} · {item.dispensingType}
                      </option>
                    ))}
                </select>
                <select
                  value={targetVolume}
                  disabled={!targetContainerId}
                  onChange={(event) => {
                    setTargetVolume(event.target.value);
                    setVariation("换器形");
                  }}
                >
                  <option value="">选择容量</option>
                  {rankedContainers
                    .find((item) => item.id === targetContainerId)
                    ?.volumeOptions.map((volume) => (
                      <option key={volume}>{volume}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="variant-generation-count">
              <strong>生成数量</strong>
              <div>
                {[1, 2, 3, 4].map((count) => (
                  <button
                    type="button"
                    className={variantCount === count ? "active" : ""}
                    key={count}
                    onClick={() => setVariantCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div className="page-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setVariantBase(null)}
              >
                取消
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={
                  !variation ||
                  generating ||
                  (variation === "换器形" &&
                    (!targetContainerId || !targetVolume))
                }
                onClick={() => void generateVariant()}
              >
                生成 {variantCount} 个变体 <span>→</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {preview && (
        <div
          className="modal-backdrop preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <section
            className="product-preview-modal final-board"
            role="dialog"
            aria-modal="true"
            aria-label={`产品方案 ${numberOf(preview.id)} 大图`}
          >
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="关闭"
            >
              ×
            </button>
            <div className="preview-zoom-toolbar"><span>滚动鼠标滚轮查看细节</span><button type="button" onClick={() => setPreviewZoom((value) => Math.max(.5, value - .25))}>−</button><b>{Math.round(previewZoom * 100)}%</b><button type="button" onClick={() => setPreviewZoom((value) => Math.min(4, value + .25))}>＋</button><button type="button" onClick={() => setPreviewZoom(1)}>重置</button></div>
            <div className="preview-zoom-stage" onWheel={(event) => { event.preventDefault(); setPreviewZoom((value) => Math.min(4, Math.max(.5, value + (event.deltaY < 0 ? .15 : -.15)))); }}>
              <img style={{ width: `${previewZoom * 100}%` }} src={preview.imageUrl} alt={`产品方案 #${numberOf(preview.id)} 9:16 完整设计图`}/>
            </div>
            <div className="preview-cmf-only">
              <div className="preview-product-spec"><strong>{preview.containerType.volume} · {preview.containerType.name}</strong><span>{preview.viewMode === "two_view" ? "正面 / 背面" : "正面 / 侧面 / 背面"}{preview.renderMode==="direct_ai"?" · 上方 60% 商业场景 / 下方 40% 结构展示":preview.directionSnapshot?` · ${presentationLayoutLabels[preview.directionSnapshot.presentationLayout]}`:""}</span></div>
              <div className="preview-color-codes">{candidateColors(preview).map((color) => <span key={color.name}><i style={{ background: color.hex }} /><strong>{color.name}</strong><code>{color.hex}</code></span>)}</div>
              <p>{preview.cmf.material} · {preview.cmf.finish}</p>
            </div>
            {preview.copyLayout?.some((item) => item.enabled) && (
              <details className="preview-copy-reference" open>
                <summary>已确认的原始文案（请与 AI 图片人工核对）</summary>
                <div>
                  {(["front", "side", "back"] as ProductCopyFace[]).map((face) => {
                    const items = preview.copyLayout?.filter((item) => item.enabled && item.face === face) || [];
                    if (!items.length) return null;
                    return <section key={face}><strong>{face === "front" ? "正面" : face === "side" ? "侧面" : "背面"}</strong>{items.map((item) => <p key={item.id}><b>{item.sourceLabel}</b><span>{item.displayText}</span>{item.sourceText !== item.displayText && <small>来源原文：{item.sourceText}</small>}</p>)}</section>;
                  })}
                </div>
              </details>
            )}
          </section>
        </div>
      )}
    </>
  );
}
