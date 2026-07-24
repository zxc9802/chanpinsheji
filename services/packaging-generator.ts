import { aiGeneratedPackagingBoxTypeId, type BoxType, type PackagingCandidate, type PackagingFace, type PackagingGenParams } from "@/types/packaging";
import type { DesignBrief } from "@/types/design-brief";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import type { SelectedContainerSpec } from "@/types/container";

export interface PackagingGenerator { generate(params: PackagingGenParams): Promise<PackagingCandidate[]>; }

const esc = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;" }[char] || char));
const svgData = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function structureSvg(name: string, mode: number, dieline = false) {
  const accent = ["#5d806c", "#876b4b", "#6c778f", "#9a695f", "#657b83", "#8a755c"][mode];
  const shapes = dieline
    ? `<g fill="none" stroke="${accent}" stroke-width="2"><rect x="118" y="92" width="164" height="116"/><rect x="118" y="40" width="164" height="52"/><rect x="118" y="208" width="164" height="52"/><rect x="48" y="92" width="70" height="116"/><rect x="282" y="92" width="70" height="116"/><path stroke-dasharray="6 5" d="M118 92h164M118 208h164M118 92v116M282 92v116"/></g>`
    : mode === 5 ? `<ellipse cx="200" cy="92" rx="64" ry="24" fill="${accent}" opacity=".75"/><path d="M136 92v132c0 15 29 27 64 27s64-12 64-27V92" fill="${accent}" opacity=".32" stroke="${accent}" stroke-width="3"/><ellipse cx="200" cy="224" rx="64" ry="27" fill="${accent}" opacity=".55"/>`
    : `<path d="M112 106 204 64l90 42-92 45z" fill="${accent}" opacity=".25" stroke="${accent}" stroke-width="3"/><path d="m112 106 90 45v112l-90-47z" fill="${accent}" opacity=".42" stroke="${accent}" stroke-width="3"/><path d="m202 151 92-45v110l-92 47z" fill="${accent}" opacity=".65" stroke="${accent}" stroke-width="3"/>${mode === 1 ? `<path d="m112 106 26-25 91 44-27 26" fill="#fff" opacity=".55"/>` : ""}`;
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 400 300"><rect width="400" height="300" rx="22" fill="#f3f5f1"/>${shapes}<text x="200" y="280" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#24342b">${esc(dieline ? `${name} · 刀版占位` : name)}</text></svg>`);
}

const rawBoxes = [
  ["lid-base","天地盖盒",[65,65,155],3,["美妆护肤","精华液","礼盒"],"上下盖分体，开启仪式感强"],
  ["drawer","抽屉盒",[70,65,160],3,["美妆护肤","香氛","礼盒"],"抽拉结构，适合陈列与套装"],
  ["book","翻盖书型盒",[75,65,165],4,["高端护肤","礼盒","精华液"],"磁吸翻盖，适合高客单产品"],
  ["tuck","双插盒",[55,55,145],1,["精华液","面霜","日化"],"轻量高效，适合规模化生产"],
  ["mailer","飞机盒",[100,75,45],2,["电商套装","食品","礼赠"],"运输保护性好，可一体成型"],
  ["tube","圆筒盒",[70,70,160],3,["香氛","精华液","茶饮"],"圆柱器型，货架辨识度高"],
] as const;

export const boxTypes: BoxType[] = rawBoxes.map(([id,name,dims,level,categories,description], index) => ({
  id, name, referenceDimensions: [...dims], referenceDimensionsLabel: `${dims[0]} × ${dims[1]} × ${dims[2]} mm`, costLevel: level,
  costLabel: ["经济","标准","进阶","高端"][level - 1], suitableCategories: [...categories], description,
  structureImageUrl: structureSvg(name,index), dielineImageUrl: structureSvg(name,index,true), source:"builtin",
}));

export const aiGeneratedBoxType: BoxType = {
  id: aiGeneratedPackagingBoxTypeId,
  name: "AI 自由设计外包装",
  structureImageUrl: structureSvg("AI 自由设计外包装", 0),
  dielineImageUrl: structureSvg("AI 自由设计外包装", 0, true),
  suitableCategories: [],
  referenceDimensions: [0, 0, 0],
  referenceDimensionsLabel: "由 AI 根据产品与设计要求推导",
  costLevel: 3,
  costLabel: "待评估",
  description: "外包装结构由 AI 根据用户设计要求自行规划",
  source: "ai",
};

const numbers = (value?: string) => (value?.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const priceCeiling = (value: string) => numbers(value).at(-1) || 0;

export function rankBoxTypes(brief: DesignBrief) {
  const premium = priceCeiling(brief.product.priceBand) >= 200;
  return [...boxTypes].sort((a,b) => {
    const score = (box: BoxType) => (box.suitableCategories.some((item) => `${brief.product.industry}${brief.product.category}`.includes(item) || item.includes(brief.product.category)) ? 5 : 0)
      + (premium && ["book","lid-base","drawer"].includes(box.id) ? 5 : 0)
      + (!premium && box.costLevel <= 2 ? 3 : 0);
    return score(b) - score(a) || a.costLevel - b.costLevel;
  });
}

function estimateContainerDimensions(container:SelectedContainerSpec){
  const amount=numbers(container.volume)[0]||30;
  if(container.id==="jar"){const diameter=Math.round(48+Math.sqrt(amount)*2.2);return [diameter,diameter,Math.round(38+amount*.45)];}
  if(container.id==="tube")return [Math.round(38+amount*.12),28,Math.round(90+amount*.55)];
  if(container.id==="ampoule")return [28,28,Math.round(75+amount*4)];
  if(container.id==="rollon")return [30,30,Math.round(75+amount*2.2)];
  const diameter=Math.round(32+Math.sqrt(amount)*1.5);return [diameter,diameter,Math.round(82+amount*.9)];
}

export function checkBoxDimensions(brief: DesignBrief, box: BoxType, container?:SelectedContainerSpec) {
  const explicit=numbers(brief.hardConstraints.dimensions).slice(0,3);
  const product=explicit.length>=3?explicit:container?estimateContainerDimensions(container):[];
  if (product.length < 3) return { fits: true, message: "未设置产品尺寸或器形容量，建议打样确认" };
  const fits = box.referenceDimensions.every((dimension,index) => dimension >= product[index] + 6);
  const source=explicit.length>=3?brief.hardConstraints.dimensions:`${container!.volume} ${container!.name}（预估 ${product.join(" × ")} mm）`;
  return { fits, message: fits ? `适配 ${source}，已预留 ≥ 6 mm` : `参考内径可能不适配 ${source}，需工程复核` };
}

const colorMap: Record<string,string> = { "雾白":"#f3f1e9","鼠尾草绿":"#7b9b87","岩灰":"#555c58","云白":"#e8ebe6","苔藓绿":"#496551","米杏":"#e9dfca","琥珀棕":"#8b5a3c","乳白":"#f2eadc","冰川蓝":"#b9dce8","金属银":"#aeb7bb","深海蓝":"#183b50","电光青":"#63c8c5","象牙白":"#f2eadb","香槟金":"#c9a66b","曜石黑":"#202321","玫瑰金":"#bd8375","青瓷绿":"#86a99a","月白":"#edf0e8","朱砂红":"#a74638","墨黑":"#292b29" };
export const packagingSwatch = (name: string) => colorMap[name] || "#769184";

const field = (params: PackagingGenParams, key: string, fallback: string) => params.finalCopy.fields.find((item) => item.key === key)?.content || fallback;
function makeFaces(params: PackagingGenParams, layout: number): PackagingFace[] {
  const frontPos = ["上方居中","左上留白","中央纵向","右下错位"][layout % 4];
  return [
    { face:"front", elements:[{type:"logo",content:params.finalLogo.imageUrl,position:frontPos},{type:"product_name",content:params.brief.product.name,position:"视觉中心"},{type:"main_slogan",content:field(params,"main_slogan",params.brief.brand.slogan),position:"下方"},{type:"sub_slogan",content:field(params,"sub_slogan",""),position:"底部"},{type:"decoration",content:`色块方案 ${layout + 1}`,position:"背景"}] },
    { face:"back", elements:[{type:"efficacy",content:field(params,"efficacy_desc",params.brief.product.efficacy.join("、")),position:"上半区"},{type:"ingredient",content:field(params,"ingredient_desc",params.brief.product.keyIngredients.join("、")),position:"中部"},{type:"usage",content:field(params,"usage_desc",params.brief.product.usageScenarios),position:"下半区"}] },
    { face:"left", elements:[{type:"efficacy",content:params.brief.product.coreSellingPoints.map((item)=>item.point).join(" · "),position:"纵向居中"}] },
    { face:"right", elements:[{type:"ingredient",content:params.brief.product.keyIngredients.join(" · "),position:"纵向居中"}] },
    { face:"top", elements:[{type:"logo",content:params.finalLogo.imageUrl,position:"居中"}] },
    { face:"bottom", elements:[{type:"usage",content:"批次 / 条码 / 生产信息",position:"居中"}] },
  ];
}

function costEstimate(params: PackagingGenParams, box: BoxType, index: number) {
  const base = [4.8,7.5,12.5,17.5][box.costLevel - 1];
  const finish = params.finalProductDesign.cmf.finish;
  const coefficient = /烫金|金属/.test(finish) ? 1.25 : /压印|蚀刻|镀膜/.test(finish) ? 1.18 : 1.08;
  const layoutFactor = params.variationHint === "更满版" ? 1.12 : params.variationHint === "更简约" ? .94 : 1 + (index % 3) * .035;
  const cost = base * coefficient * layoutFactor;
  const max = priceCeiling(params.brief.hardConstraints.maxPackageCost || "");
  return `约 ¥${cost.toFixed(1)}/套${max && cost > max ? ` · 超出预算 ¥${max.toFixed(1)}` : ""}`;
}

function directPreviewPrompt(params:PackagingGenParams,index:number){
 const variation=params.variationHint?`本轮微调：${params.variationHint}。`:"";
 const base=params.designPrompt?.trim()||`为品牌 ${params.brief.brand.name} 的 ${params.brief.product.name} 设计外包装效果预览，沿用产品 CMF ${params.finalProductDesign.cmf.colorScheme.join("、")}、${params.finalProductDesign.cmf.material}、${params.finalProductDesign.cmf.finish}。`;
 const box=params.boxType||boxTypes.find((item)=>item.id===params.boxTypeId)||boxTypes[0];
 const analysis=box.referenceAnalysis;
 const structureSummary=analysis?.structureSummary||box.description;
 const views=analysis?.viewMode==="two_view"?"正面和背面":"正面、侧面和背面";
 return `${base}

真实参考图顺序：第一张是外包装结构参考，是唯一结构强约束，必须保持轮廓、比例、开合方式和主要结构；第二张是定稿 Logo，必须保持图形、字形、比例和组合关系。没有产品概念图或产品本体图片输入。产品 CMF 仅以文字参与配色与材质协调。
唯一主设计对象是外包装。已确认结构：${structureSummary}。禁止把外包装画成茶包、面膜袋、瓶器、罐体、设备或其他产品本体。
${variation}这是同一提示词下的第 ${index+1} 个效果方案，可以调整次级图形、光线、材质细节和场景道具，但不得更换外包装结构或 Logo。
输出一张 9:16 高质量外包装概念效果预览：上方约 60% 是一张连续完整的商业场景，完整外包装必须占据视觉中心；产品本体最多是小比例辅助道具。下方约 40% 是干净背景上的外包装结构效果展示，只展示同一外包装的${views}，严禁任何产品本体进入下方结构区。上下只允许水平分区，所有视图必须是同一套外包装设计。
严禁刀版、展开图、平面展开稿、CAD、尺寸线、裁切线、折线、出血线、印刷工程标注、灰色信息块、UI、提示词、JSON、水印和左右分栏。画面必须是制作完成后的真实外包装效果，而不是设计稿截图。`;
}

class AiPackagingGenerator implements PackagingGenerator{
 async generate(params:PackagingGenParams){
  const box=params.boxType||boxTypes.find((item)=>item.id===params.boxTypeId)||boxTypes[0];
  const count=Math.max(1,Math.min(5,params.count));
  const prompts=Array.from({length:count},(_,index)=>directPreviewPrompt(params,index));
  const references=[
   box.referenceImageUrl||box.structureImageUrl,
   params.finalLogo.imageUrl,
   params.basePackagingImageUrl,
  ].filter((value):value is string=>Boolean(value));
  const urls=await callAi<(string|undefined)[]>("packaging","image",{prompts,referenceImageGroups:prompts.map(()=>references),size:"1024x1536",quality:"high"});
  const seed=Date.now();
  const generated=urls.flatMap((url,index)=>{
   if(!url)return[];
   const palette=params.variationHint==="换配色"&&index%2?[...params.finalProductDesign.cmf.colorScheme].reverse():[...params.finalProductDesign.cmf.colorScheme];
   return[{id:`pack-ai-${seed}-${index}`,boxTypeId:box.id,previewImageUrl:url,faces:makeFaces(params,index),palette,costEstimate:costEstimate(params,box,index),renderMode:"direct_ai_preview" as const,generationPrompt:prompts[index],directionName:params.directionName,createdAt:new Date().toISOString(),subjectReviewStatus:"pending" as const,...(params.basePackagingId?{parentId:params.basePackagingId}:{}),round:1}];
  });
  if(!generated.length)throw new Error("图像服务未返回外包装效果预览");
  return generated;
 }
}
class ProviderPackagingGenerator implements PackagingGenerator{
 private ai=new AiPackagingGenerator();
 async generate(params:PackagingGenParams){const provider=await getAiProvider("image");try{return await this.ai.generate(params);}catch(error){emitAiNotice(`包装视觉生成失败（${provider}）：${aiErrorMessage(error)}`);throw error;}}
}
export const packagingGenerator: PackagingGenerator = new ProviderPackagingGenerator();
