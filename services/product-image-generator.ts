import type { ProductDesignCandidate, ProductImageGenParams, ProductViewType } from "@/types/product-design";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import { buildProductDirectPrompt } from "./prompts/image-prompts";
import { containerPainResponses, containerTypes, renderContainerDesignSvg } from "./container-library";
import { inferProductStructureKind, resolveProductViewMode } from "./product-view-mode";

export interface ProductImageGenerator {
  generate(params: ProductImageGenParams): Promise<ProductDesignCandidate[]>;
  regenerateView(params:ProductImageGenParams,candidate:ProductDesignCandidate,view:ProductViewType):Promise<ProductDesignCandidate>;
}

type Palette = { names: string[]; colors: string[]; material: string; finish: string };
type DirectionDefinition = { name: string; keywords: string[]; baseDescription: string; palettes: Palette[] };

export const productStyleDirections: DirectionDefinition[] = [
  { name: "现代极简", keywords: ["留白", "克制", "轻盈"], baseDescription: "用简净器形与低饱和配色，传达清晰、可信的产品价值。", palettes: [
    { names: ["雾白", "鼠尾草绿"], colors: ["#f3f1e9", "#7b9b87"], material: "磨砂玻璃", finish: "哑光喷涂、丝印 Logo" },
    { names: ["岩灰", "云白"], colors: ["#555c58", "#e8ebe6"], material: "高透玻璃", finish: "半透明渐变、极细线丝印" },
  ] },
  { name: "自然植萃", keywords: ["植物", "疗愈", "有机"], baseDescription: "以植物色谱和温润触感，强化天然成分与温和功效认知。", palettes: [
    { names: ["苔藓绿", "米杏"], colors: ["#496551", "#e9dfca"], material: "再生玻璃", finish: "雾面蚀刻、植物纹理压印" },
    { names: ["琥珀棕", "乳白"], colors: ["#8b5a3c", "#f2eadc"], material: "琥珀玻璃", finish: "低光泽喷涂、纸感标签" },
  ] },
  { name: "科技实验室", keywords: ["精准", "功效", "未来感"], baseDescription: "用实验室语汇和结构化细节，突出成分依据与可验证功效。", palettes: [
    { names: ["冰川蓝", "金属银"], colors: ["#b9dce8", "#aeb7bb"], material: "高硼硅玻璃", finish: "冷光镀膜、激光蚀刻" },
    { names: ["深海蓝", "电光青"], colors: ["#183b50", "#63c8c5"], material: "透明亚克力", finish: "双色注塑、参数化丝印" },
  ] },
  { name: "轻奢高端", keywords: ["精致", "质感", "仪式感"], baseDescription: "通过高质感材质和克制金属细节，建立高端但不过度张扬的体验。", palettes: [
    { names: ["象牙白", "香槟金"], colors: ["#f2eadb", "#c9a66b"], material: "厚壁玻璃", finish: "细砂哑光、烫金 Logo" },
    { names: ["曜石黑", "玫瑰金"], colors: ["#202321", "#bd8375"], material: "釉面玻璃", finish: "高光烤漆、金属环饰" },
  ] },
  { name: "东方美学", keywords: ["含蓄", "雅致", "文化感"], baseDescription: "将东方留白、器物比例和当代材质结合，形成有辨识度的文化气质。", palettes: [
    { names: ["青瓷绿", "月白"], colors: ["#86a99a", "#edf0e8"], material: "陶瓷釉面", finish: "半哑光釉、凹刻 Logo" },
    { names: ["朱砂红", "墨黑"], colors: ["#a74638", "#292b29"], material: "细纹陶瓷", finish: "局部亮釉、印章式烫印" },
  ] },
];

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char] || char));
const dataSvg = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const viewName:Record<ProductViewType,string>={front:"正面",side:"侧面",back:"背面"};
const loadCanvasImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("图片加载失败"));image.src=src});

async function compressReferenceImage(source:string,maxEdge=1024,quality=.8){
  if(!source||typeof document==="undefined")return source;
  try{
    const image=await loadCanvasImage(source);const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d");if(!context)return source;context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",quality);
  }catch{return source}
}

async function createReferenceBoard(urls:string[]){
  const sources=urls.filter(Boolean).slice(0,10);if(!sources.length||typeof document==="undefined")return sources[0];
  try{const images=await Promise.all(sources.map(loadCanvasImage));const columns=images.length===1?1:Math.min(3,images.length);const rows=Math.ceil(images.length/columns);const cell=360;const canvas=document.createElement("canvas");canvas.width=columns*cell;canvas.height=rows*cell;const context=canvas.getContext("2d");if(!context)return sources[0];context.fillStyle="#f5f5f2";context.fillRect(0,0,canvas.width,canvas.height);images.forEach((image,index)=>{const x=index%columns*cell,y=Math.floor(index/columns)*cell;const scale=Math.min((cell-24)/image.naturalWidth,(cell-24)/image.naturalHeight);const width=image.naturalWidth*scale,height=image.naturalHeight*scale;context.fillStyle="#ffffff";context.fillRect(x+8,y+8,cell-16,cell-16);context.drawImage(image,x+(cell-width)/2,y+(cell-height)/2,width,height)});return canvas.toDataURL("image/jpeg",.78)}catch{return sources[0]}
}

async function normalizePortraitImage(source:string){
  if(!source||typeof document==="undefined")return source;
  try{
    const image=await loadCanvasImage(source),canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920;
    const context=canvas.getContext("2d");if(!context)return source;
    const cover=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
    const coverW=image.naturalWidth*cover,coverH=image.naturalHeight*cover;
    context.save();context.filter="blur(36px)";context.globalAlpha=.32;context.drawImage(image,(canvas.width-coverW)/2,(canvas.height-coverH)/2,coverW,coverH);context.restore();
    context.fillStyle="rgba(248,248,245,.62)";context.fillRect(0,0,canvas.width,canvas.height);
    const contain=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
    const width=image.naturalWidth*contain,height=image.naturalHeight*contain;
    context.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
    return canvas.toDataURL("image/jpeg",.94);
  }catch{return source}
}

function vesselSvg(brand: string, product: string, colors: string[], shape: number, material: string) {
  const [primary, accent] = colors;
  const shapes = [
    `<rect x="132" y="86" width="116" height="190" rx="26" fill="url(#body)"/><rect x="154" y="54" width="72" height="42" rx="8" fill="${accent}"/><path d="M190 54V35H242" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`,
    `<rect x="142" y="95" width="96" height="181" rx="19" fill="url(#body)"/><rect x="158" y="62" width="64" height="42" rx="7" fill="${accent}"/><ellipse cx="190" cy="55" rx="34" ry="24" fill="${accent}"/>`,
    `<rect x="113" y="137" width="154" height="119" rx="34" fill="url(#body)"/><rect x="108" y="112" width="164" height="42" rx="15" fill="${accent}"/>`,
    `<path d="M143 66H237L257 276H123Z" fill="url(#body)"/><rect x="151" y="42" width="78" height="36" rx="8" fill="${accent}"/>`,
    `<rect x="143" y="70" width="94" height="206" rx="11" fill="url(#body)"/><rect x="149" y="43" width="82" height="40" rx="8" fill="${accent}"/><circle cx="190" cy="63" r="11" fill="${primary}"/>`,
  ];
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 380 380"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}" stop-opacity=".14"/><stop offset="1" stop-color="${accent}" stop-opacity=".3"/></linearGradient><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset=".5" stop-color="${primary}" stop-opacity=".82"/><stop offset="1" stop-color="${accent}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="12" flood-opacity=".18"/></filter></defs><rect width="380" height="380" rx="24" fill="url(#bg)"/><ellipse cx="190" cy="302" rx="93" ry="17" fill="#24352c" opacity=".12"/><g filter="url(#shadow)">${shapes[shape % shapes.length]}</g><rect x="149" y="159" width="82" height="70" rx="5" fill="white" opacity=".86"/><text x="190" y="181" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#27352d">${escapeXml(brand.slice(0, 14) || "BRAND")}</text><text x="190" y="199" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" fill="#536159">${escapeXml(product.slice(0, 18) || "PRODUCT")}</text><text x="190" y="218" text-anchor="middle" font-family="Arial,sans-serif" font-size="5" letter-spacing="1" fill="#77837c">${escapeXml(material.toUpperCase())}</text></svg>`);
}

export const productDirectionPreview = (direction: string, container=containerTypes[0], volume=container.volumeOptions[0]) => {
  const definition = productStyleDirections.find((item) => item.name === direction);
  const palette = definition?.palettes[0] || {names:["结构灰","纸白"],colors:["#747A76","#F2F1ED"],material:container.materialOptions[0]||"按器型材质",finish:"中性结构预览"};
  return container.isCustom?container.sketchUrl:renderContainerDesignSvg(container,direction,definition?.keywords.join(" · ")||"自由创意",palette.colors,palette.material,volume);
};

const painSolution = (content: string) => {
  if (/泵|按压|取用/.test(content)) return "按压式真空泵，单手精准取量";
  if (/搓泥|黏腻|粘腻/.test(content)) return "定量泵控量，减少过量叠涂";
  if (/持效|反复|补涂/.test(content)) return "气密避光瓶体，帮助维持配方稳定";
  if (/敏感|刺激/.test(content)) return "密封防回流结构，降低内容物污染风险";
  return "易控量密封结构，改善日常使用体验";
};

class StructuredProductBlueprintGenerator implements ProductImageGenerator {
  async generate(params: ProductImageGenParams): Promise<ProductDesignCandidate[]> {
    const definition = productStyleDirections.find((item) => item.name === params.styleDirection);
    const directionIndex = Math.max(0,productStyleDirections.indexOf(definition as DirectionDefinition));
    const container = params.containerType || containerTypes.find((item)=>item.id===params.containerTypeId) || containerTypes[0];
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sellingPoints = params.brief.product.coreSellingPoints.map((item) => item.point);
    const responsivePains = containerPainResponses(container,params.brief);
    const finalViewMode=resolveProductViewMode(params.brief,container);
    const inferredKind=inferProductStructureKind(params.brief,container);
    const paletteColors=(names:string[])=>names.map(name=>productStyleDirections.flatMap(item=>item.palettes).flatMap(item=>item.names.map((paletteName,index)=>({paletteName,color:item.colors[index]}))).find(item=>item.paletteName===name)?.color||"#ccd4ce");
    return Array.from({ length: params.count }, (_, index) => {
      const directionColors=params.designDirection?.surfaceCmf.colors?.length?params.designDirection.surfaceCmf.colors:params.customColors;
      const legacyPalette=definition?.palettes[(index + (params.variationHint === "换配色" ? 1 : 0)) % definition.palettes.length];
      const selectedPalette=legacyPalette||{
        names:directionColors?.map(color=>color.name)||["方向主色","方向辅色"],
        colors:directionColors?.map(color=>color.hex)||["#D8D4CC","#6E746F"],
        material:params.containerType?.materialOptions[0]||params.baseCmf?.material||"按参考器型基础包材",
        finish:params.designDirection?.surfaceCmf.printFinish||params.baseCmf?.finish||"按本方向表面 CMF 执行",
      };
      const customPalette=directionColors?.length?{names:directionColors.map(color=>color.name),colors:directionColors.map(color=>color.hex),material:selectedPalette.material,finish:params.designDirection?.surfaceCmf.printFinish||selectedPalette.finish}:undefined;
      const basePalette=params.variationHint==="换器形"&&params.baseCmf?{names:params.baseCmf.colorScheme,colors:params.baseCmf.colors?.map(color=>color.hex)||paletteColors(params.baseCmf.colorScheme),material:params.baseCmf.material,finish:params.baseCmf.finish}:customPalette||selectedPalette;
      const material = params.variationHint === "换材质" ? container.materialOptions[index%container.materialOptions.length] : basePalette.material;
      const finish = params.variationHint === "更简约" ? "单色哑光、无标签直印" : params.variationHint === "更精致" ? `${basePalette.finish}、局部金属细节` : basePalette.finish;
      const matched = sellingPoints.length ? [sellingPoints[index % sellingPoints.length], ...(sellingPoints.length > 1 && index % 2 ? [sellingPoints[(index + 1) % sellingPoints.length]] : [])] : params.brief.product.efficacy.slice(0, 1);
      const avoided = responsivePains.map(content=>`${content} → ${container.name}${container.dispensingType}结构，改善取用体验`);
      const candidate:ProductDesignCandidate={
        id: `product-${seed}-${directionIndex}-${index}`,
        createdAt: new Date().toISOString(),
        imageUrl: renderContainerDesignSvg(container,params.brief.brand.name,params.brief.product.name,basePalette.colors,material,params.volume),
        styleDirection: params.styleDirection||params.designDirection?.creativeConcept||definition?.name||"自由创意",
        containerType:{id:container.id,name:container.name,volume:params.volume,dispensingType:container.dispensingType,sketchUrl:container.sketchUrl,viewMode:finalViewMode,isCustom:container.isCustom,kind:inferredKind,source:container.source,description:container.description,dimensions:container.dimensions,shapeFamily:container.shapeFamily},
        cmf: { colorScheme: basePalette.names, colors: basePalette.names.map((name, colorIndex) => ({ name, hex: basePalette.colors[colorIndex] || "#ccd4ce" })), material, finish },
        matchedSellingPoints: matched,
        avoidedPainPoints: avoided,
        viewMode: finalViewMode,
        copyApplied: [],
        copyReferenceKeys:undefined,
        copyAdaptations:[],
        logoType:params.finalLogo.logoType,
        sourceViews: [],
        generationPrompt:params.customPrompt,
        directionSnapshot:params.designDirection,
        referenceBoardSnapshot:params.designReferenceImages?.map(item=>item.id).join(","),
        ...(params.baseDesignId ? { parentId: params.baseDesignId } : {}),
        round: 1,
      };
      return{...candidate,layoutWarnings:[]};
    });
  }
  async regenerateView(_params:ProductImageGenParams,candidate:ProductDesignCandidate,_view:ProductViewType){return candidate;}
}

class AiProductImageGenerator implements ProductImageGenerator{
  private blueprints=new StructuredProductBlueprintGenerator();
  async generate(params:ProductImageGenParams){
    if(!params.finalLogo.imageUrl)throw new Error("缺少定稿 Logo 原图，无法生成产品概念图");
    params.onStatus?.("preparing_references");
    const candidates=await this.blueprints.generate({...params,count:Math.min(params.count,4)});
    const selectedReferences=params.designReferenceImages?.map(item=>item.imageUrl) || params.designReferenceImageUrls || [];
    const referenceBoard=await createReferenceBoard(selectedReferences.slice(0,3));
    const sharedReferences=await Promise.all([params.containerReferenceImageUrl,params.finalLogo.imageUrl,referenceBoard].filter((url):url is string=>Boolean(url)).map(url=>compressReferenceImage(url)));
    params.onStatus?.("uploading_references");
    params.onStatus?.("generating");
    try{const images=await callAi<(string|undefined)[]>("product","image",{prompts:candidates.map(candidate=>buildProductDirectPrompt(candidate,params.brief,params.variationHint)),referenceImageGroups:candidates.map(()=>sharedReferences),size:"1024x1536",quality:"high"});const normalized=await Promise.all(images.map(image=>image?normalizePortraitImage(image):undefined));const ready=candidates.flatMap((candidate,index)=>normalized[index]?[{...candidate,imageUrl:normalized[index]!,renderMode:"direct_ai" as const,generationStatus:"completed" as const,sourceViews:[],composedViews:undefined,technicalSheetUrl:undefined,heroImageUrl:undefined,layoutWarnings:[]}]:[]);if(!ready.length)throw new Error("AI 未返回完整产品设计图");params.onStatus?.("completed");return ready;}catch(error){params.onStatus?.("failed");throw error}
  }
  async regenerateView(params:ProductImageGenParams,candidate:ProductDesignCandidate,_view:ProductViewType){const [updated]=await this.generate({...params,baseDesignId:candidate.id,count:1});if(!updated)throw new Error("AI 未返回完整产品设计图");return{...updated,id:candidate.id,createdAt:candidate.createdAt,round:candidate.round,parentId:candidate.parentId};}
}
class ProviderProductImageGenerator implements ProductImageGenerator{
 private ai=new AiProductImageGenerator();
 async generate(params:ProductImageGenParams){const provider=await getAiProvider("image");try{return await this.ai.generate(params);}catch(error){emitAiNotice(`产品图生成失败（${provider}）：${aiErrorMessage(error)}`);throw error;}}
 async regenerateView(params:ProductImageGenParams,candidate:ProductDesignCandidate,view:ProductViewType){const provider=await getAiProvider("image");try{return await this.ai.regenerateView(params,candidate,view);}catch(error){emitAiNotice(`产品${viewName[view]}补生成失败（${provider}）：${aiErrorMessage(error)}`);throw error;}}
}
export const productImageGenerator: ProductImageGenerator = new ProviderProductImageGenerator();
