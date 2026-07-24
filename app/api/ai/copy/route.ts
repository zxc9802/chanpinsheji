import { aiServerConfig } from "@/lib/ai-config";
import { fetchAiJson } from "@/lib/server-ai-client";
import { buildCopyGenerationPrompt, buildRewritePrompt, copySystemPrompt, prohibitedAdvertisingTerms } from "@/services/prompts/copy-prompts";
import { briefImportSystemPrompt, buildBriefImportPrompt } from "@/services/prompts/brief-import-prompt";
import { importDesignBrief } from "@/lib/import-design-brief";
import { copyFieldKeys, copyFieldLabels, type CopyField, type CopyPackage } from "@/types/copy";
import { buildProductStructureIdentificationPrompt, buildProductStructurePrompt, productStructureSystemPrompt } from "@/services/prompts/product-structure-prompt";
import type { ProductShapeFamily, ProductStructureKind } from "@/types/container";
import { buildProductDesignDirectionPrompt,productDesignDirectionSystemPrompt } from "@/services/prompts/product-design-direction-prompt";
import { buildPackagingDesignPrompt, packagingDesignPromptSystemPrompt } from "@/services/prompts/packaging-design-prompt";
import { buildProductCopyLayoutPrompt, productCopyLayoutSystemPrompt } from "@/services/prompts/product-copy-layout-prompt";
import { directionDifferenceCount } from "@/services/product-design-diversity";
import type {
 ProductDesignDirectionSnapshot,
 ProductInspirationSource,
 ProductSurfaceCmf,
 ProductTypographySystem,
} from "@/types/product-design";
import type { PackagingReferenceAnalysis, PackagingStructureKind, PackagingSubjectReview } from "@/types/packaging";

type DeepSeekPayload={choices?:{message?:{content?:string}}[];usage?:{total_tokens?:number;prompt_tokens?:number;completion_tokens?:number}};
type GeminiPayload={candidates?:{content?:{parts?:{text?:string}[]}}[];usageMetadata?:{promptTokenCount?:number;candidatesTokenCount?:number;totalTokenCount?:number}};
function cleanJson(text:string){return text.trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();}
function parseImportedBrief(text:string,projectId:string){const raw=JSON.parse(cleanJson(text)) as Record<string,unknown>;const candidate=(raw.designBrief&&typeof raw.designBrief==="object"?raw.designBrief:raw) as Record<string,unknown>;const brief=importDesignBrief({...candidate,projectId});if(!brief.brand.name&&!brief.product.name&&!brief.brand.positioning&&!brief.product.coreSellingPoints.length)throw new Error("文档中未识别到可填写的品牌或产品信息");return brief;}
const structureKinds:ProductStructureKind[]=["liquid_container","flexible_pack","solid_product","custom"];
const shapeFamilies:ProductShapeFamily[]=["bottle","jar","tube","pouch","rectangular_device","cylindrical","rigid_body","wearable","custom"];
function parseStructureRecommendations(text:string,minimum=3){
 const parsed=JSON.parse(cleanJson(text)) as {recommendations?:Record<string,unknown>[]};
 if(!Array.isArray(parsed.recommendations)||parsed.recommendations.length<minimum)throw new Error(`结构建议不足 ${minimum} 项`);
 return parsed.recommendations.slice(0,6).map((item,index)=>{
  const name=String(item.name||"").trim(),description=String(item.description||"").trim(),reason=String(item.recommendationReason||"").trim();
  if(!name||!description||!reason)throw new Error(`第 ${index+1} 条结构建议信息不完整`);
  const kind=structureKinds.includes(item.kind as ProductStructureKind)?item.kind as ProductStructureKind:"custom";
  const shapeFamily=shapeFamilies.includes(item.shapeFamily as ProductShapeFamily)?item.shapeFamily as ProductShapeFamily:"custom";
  const specifications=Array.isArray(item.specificationOptions)?item.specificationOptions.map(String).filter(Boolean).slice(0,4):[];
  const materials=Array.isArray(item.materialOptions)?item.materialOptions.map(String).filter(Boolean).slice(0,5):[];
  return{name,kind,shapeFamily,description,interactionMethod:String(item.interactionMethod||"按产品结构使用"),specificationOptions:specifications.length?specifications:["按实际产品尺寸"],materialOptions:materials.length?materials:["按工程方案确认"],costLevel:[1,2,3].includes(Number(item.costLevel))?Number(item.costLevel):2,viewMode:item.viewMode==="two_view"?"two_view":"three_view",recommendationReason:reason};
 });
}
function parseProductDesignDirections(text:string,count:number,validReferenceIds:string[]=[]){
 const parsed=JSON.parse(cleanJson(text)) as {directions?:Record<string,unknown>[]};
 if(!Array.isArray(parsed.directions)||parsed.directions.length<count)throw new Error(`设计方向不足 ${count} 个`);
 const directions=parsed.directions.slice(0,count).map((item,index)=>{
  const name=String(item.name||"").trim(),summary=String(item.summary||"").trim(),promptZh=String(item.promptZh||item.prompt_zh||item.prompt||"").trim();
  const surfaceRaw=(item.surfaceCmf&&typeof item.surfaceCmf==="object"?item.surfaceCmf:{}) as Record<string,unknown>;
  const colors=(Array.isArray(surfaceRaw.colors)?surfaceRaw.colors:Array.isArray(item.colors)?item.colors:[]).map((color)=>{const value=color as Record<string,unknown>;return{name:String(value.name||"").trim(),hex:String(value.hex||"").trim().toUpperCase()}}).filter(color=>color.name&&/^#[0-9A-F]{6}$/.test(color.hex)).slice(0,5);
  const creativeConcept=String(item.creativeConcept||"").trim(),visualPersonality=String(item.visualPersonality||"").trim(),designRationale=String(item.designRationale||"").trim();
  const graphicLanguage=String(surfaceRaw.graphicLanguage||"").trim(),typographyStyle=String(surfaceRaw.typographyStyle||"").trim(),printFinish=String(surfaceRaw.printFinish||"").trim(),sceneDirection=String(surfaceRaw.sceneDirection||"").trim(),composition=String(surfaceRaw.composition||"").trim();
  const typographyRaw=(item.typographySystem&&typeof item.typographySystem==="object"?item.typographySystem:{}) as Record<string,unknown>;
  const hierarchyRaw=(typographyRaw.hierarchy&&typeof typographyRaw.hierarchy==="object"?typographyRaw.hierarchy:{}) as Record<string,unknown>;
  const typographySystem:ProductTypographySystem={
   fontPairing:String(typographyRaw.fontPairing||"").trim(),
   hierarchy:{
    brand:String(hierarchyRaw.brand||"").trim(),
    productName:String(hierarchyRaw.productName||"").trim(),
    slogan:String(hierarchyRaw.slogan||"").trim(),
    supporting:String(hierarchyRaw.supporting||"").trim(),
    body:String(hierarchyRaw.body||"").trim(),
   },
   alignment:String(typographyRaw.alignment||"").trim(),
   spacing:String(typographyRaw.spacing||"").trim(),
   grid:String(typographyRaw.grid||"").trim(),
   graphicIntegration:String(typographyRaw.graphicIntegration||"").trim(),
  };
  const avoidMotifs=(Array.isArray(item.avoidMotifs)?item.avoidMotifs:[]).map(String).map(value=>value.trim()).filter(Boolean).slice(0,8);
  const referenceImageIds=[...new Set((Array.isArray(item.referenceImageIds)?item.referenceImageIds:[]).map(String))].filter(id=>validReferenceIds.includes(id)).slice(0,3);
  const inspirations=(Array.isArray(item.inspirationSources)?item.inspirationSources:[]).map(raw=>{const value=raw as Record<string,unknown>;const kind=String(value.kind||"brief") as ProductInspirationSource["kind"];return{kind:["brief","logo","reference_image","user_requirement"].includes(kind)?kind:"brief",label:String(value.label||"").trim(),usage:String(value.usage||"").trim()}}).filter(source=>source.label&&source.usage).slice(0,8);
  if(!name||!summary||promptZh.length<80||colors.length<2)throw new Error(`第 ${index+1} 个设计方向的中文提示词或配色色号不完整`);
  if(!creativeConcept||!visualPersonality||!designRationale||!graphicLanguage||!typographyStyle||!printFinish||!sceneDirection||!composition)throw new Error(`第 ${index+1} 个方向的自由创意、字体、工艺、场景或构图不完整`);
  if(!typographySystem.fontPairing||!typographySystem.alignment||!typographySystem.spacing||!typographySystem.grid||!typographySystem.graphicIntegration||Object.values(typographySystem.hierarchy).some(value=>!value))throw new Error(`第 ${index+1} 个方向的字体组合、层级、对齐、间距、网格或图文关系不完整`);
  const surfaceCmf:ProductSurfaceCmf={colors,graphicLanguage,typographyStyle,printFinish,sceneDirection,composition:"固定 9:16 上下结构：上方 60% 单一商业场景，下方 40% 结构视图"};
  return{name,summary,colors,promptZh,prompt:promptZh,creativeStrategy:"open_creative" as const,presentationLayout:"hero_top_views_bottom" as const,creativeConcept,visualPersonality,designRationale,inspirationSources:inspirations,surfaceCmf,typographySystem,copyAdaptations:[],graphicLanguage,informationLayout:"由 AI 自由组织包装文字与视觉层级",materialStrategy:printFinish,sceneDirection,avoidMotifs,referenceImageIds};
 });
 const snapshots=directions as ProductDesignDirectionSnapshot[];
 for(let index=0;index<snapshots.length;index++)for(let previous=0;previous<index;previous++)if(directionDifferenceCount(snapshots[index],snapshots[previous])<4)throw new Error(`方向 ${previous+1} 与方向 ${index+1} 在配色、图形、字体、工艺、场景和视觉性格中不足四项差异`);
 return directions;
}
function parseProductCopyLayout(text:string,fields:CopyField[],viewMode:"two_view"|"three_view"){
 const parsed=JSON.parse(cleanJson(text)) as {items?:Record<string,unknown>[];notes?:unknown[]};
 if(!Array.isArray(parsed.items))throw new Error("缺少上版规划 items");
 const byKey=new Map<CopyField["key"],CopyField>(fields.map(field=>[field.key,field]));
 const seen=new Set<string>();
 const validFaces:string[]=["front","side","back"];
 const allowedRoles:string[]=["slogan","benefit","ingredient","usage","back_label"];
 const items=parsed.items.map((raw,index)=>{
  const sourceKey=String(raw.sourceKey||"") as CopyField["key"];
  const source=byKey.get(sourceKey);
  if(!source||seen.has(sourceKey))throw new Error(`第 ${index+1} 条来源字段无效或重复`);
  seen.add(sourceKey);
  let displayText=String(raw.displayText||"").trim();
  if(!displayText)throw new Error(`第 ${index+1} 条包装文案为空`);
  const sourceNumbers:string[]=source.content.match(/\d+(?:\.\d+)?%?/g)||[];
  const displayNumbers:string[]=displayText.match(/\d+(?:\.\d+)?%?/g)||[];
  if(displayNumbers.some(value=>!sourceNumbers.includes(value)))throw new Error(`“${source.label}”增加了原文没有的数字`);
  if(prohibitedAdvertisingTerms.some((term:string)=>displayText.includes(term)&&!source.content.includes(term)))throw new Error(`“${source.label}”增加了风险承诺`);
  let face=validFaces.includes(String(raw.face))?String(raw.face):"back";
  if(viewMode==="two_view"&&face==="side")face="back";
  const role=allowedRoles.includes(String(raw.role))?String(raw.role):sourceKey==="ingredient_desc"?"ingredient":sourceKey==="usage_desc"?"usage":sourceKey==="back_panel"?"back_label":sourceKey.includes("slogan")?"slogan":"benefit";
  return{sourceKey,displayText:displayText.slice(0,120),face,role,priority:[1,2,3].includes(Number(raw.priority))?Number(raw.priority):2,enabled:raw.enabled!==false};
 });
 for(const field of fields)if(!seen.has(field.key))throw new Error(`规划遗漏 ${field.label}`);
 return{items,notes:Array.isArray(parsed.notes)?parsed.notes.map(String).slice(0,5):[]};
}
async function identifyStructureWithGemini(prompt:string,imageUrl:string){
 const match=imageUrl.match(/^data:([^;]+);base64,(.+)$/);if(!match)throw new Error("上传参考图格式无效");
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"structure",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:productStructureSystemPrompt}]},contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:match[1],data:match[2]}}]}],generationConfig:{temperature:.3,responseMimeType:"application/json",maxOutputTokens:1800}}});
 return{content:result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"",usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
async function designPromptsWithGemini(prompt:string,images:{id?:string;name?:string;dataUrl?:string}[]){
 const imageParts=await Promise.all(images.slice(0,11).map(async(image,index)=>{
  const source=String(image.dataUrl||"");if(!source)throw new Error(`${index===0?"定稿 Logo":"视觉参考图"} ${index+1} 缺少图片`);
  try{return await imagePartFromSource(source)}catch(error){throw new Error(`${index===0?"定稿 Logo":"视觉参考图"} ${index+1} 无法读取：${error instanceof Error?error.message:"未知错误"}`)}
 }));
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"product-design-prompts-vision",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:productDesignDirectionSystemPrompt}]},contents:[{role:"user",parts:[{text:prompt},...imageParts]}],generationConfig:{temperature:.9,responseMimeType:"application/json",maxOutputTokens:5000}}});
 return{data:{choices:[{message:{content:result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||""}}]},usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
async function packagingPromptWithGemini(prompt:string,images:{name:string;dataUrl:string}[]){
 const imageParts=await Promise.all(images.map(async(image,index)=>{
  try{return await imagePartFromSource(image.dataUrl)}catch(error){throw new Error(`${image.name||`包装参考图 ${index+1}`}无法读取：${error instanceof Error?error.message:"未知错误"}`)}
 }));
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"packaging-design-prompt",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:packagingDesignPromptSystemPrompt}]},contents:[{role:"user",parts:[{text:prompt},...imageParts]}],generationConfig:{temperature:.9,responseMimeType:"application/json",maxOutputTokens:7000}}});
 return{content:result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"",usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
const packagingStructureKinds:PackagingStructureKind[]=["folding_carton","rigid_box","drawer_box","tube","pouch","tray","custom"];
function parsePackagingReferenceAnalysis(text:string):PackagingReferenceAnalysis{
 const raw=JSON.parse(cleanJson(text)) as Record<string,unknown>;
 const structureName=String(raw.structureName||"").trim();
 const structureSummary=String(raw.structureSummary||"").trim();
 const openingMethod=String(raw.openingMethod||"").trim();
 const outlineRatio=String(raw.outlineRatio||"").trim();
 if(raw.subjectType!=="outer_package")throw new Error("上传图片未识别为外包装结构参考");
 if(!structureName||structureSummary.length<12||!openingMethod||!outlineRatio)throw new Error("外包装结构识别结果不完整");
 const structureKind=packagingStructureKinds.includes(raw.structureKind as PackagingStructureKind)?raw.structureKind as PackagingStructureKind:"custom";
 return{subjectType:"outer_package",structureKind,structureName,structureSummary,openingMethod,outlineRatio,viewMode:raw.viewMode==="two_view"?"two_view":"three_view",confidence:Math.max(0,Math.min(100,Math.round(Number(raw.confidence)||0))),analyzedAt:new Date().toISOString()};
}
async function identifyPackagingStructureWithGemini(params:{imageUrl:string;category?:string;productName?:string}){
 const parts:Array<Record<string,unknown>>=[{text:`识别这张图片中的外包装结构。产品为“${params.productName||"未提供"}”，品类为“${params.category||"未提供"}”。只分析外包装本身的结构类型、外轮廓比例、开合方式和应展示的视图。不得把产品本体、内袋、瓶器或内容物当作外包装。严格 JSON：{"subjectType":"outer_package","structureKind":"folding_carton|rigid_box|drawer_box|tube|pouch|tray|custom","structureName":"结构名称","structureSummary":"可供生图锁定结构的完整描述","openingMethod":"开合方式","outlineRatio":"外轮廓长宽厚比例描述","viewMode":"two_view|three_view","confidence":0}`}];
 parts.push(await imagePartFromSource(params.imageUrl));
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"packaging-structure-identify",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:"你是包装结构工程师。只识别外包装，不分析产品视觉风格；只输出严格 JSON。"}]},contents:[{role:"user",parts}],generationConfig:{temperature:.2,responseMimeType:"application/json",maxOutputTokens:1200}}});
 const text=result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
 return{data:parsePackagingReferenceAnalysis(text),usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
function parsePackagingSubjectReview(text:string):PackagingSubjectReview{
 const raw=JSON.parse(cleanJson(text)) as Record<string,unknown>;
 const clamp=(value:unknown)=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
 const outerPackageCorrect=raw.outerPackageCorrect!==false;
 const structureViewsPure=raw.structureViewsPure!==false;
 const structureSimilarity=clamp(raw.structureSimilarity);
 const productDominance=clamp(raw.productDominance);
 const issues=(Array.isArray(raw.issues)?raw.issues:[]).map(String).map(item=>item.trim()).filter(Boolean).slice(0,6);
 if(!outerPackageCorrect)issues.unshift("外包装主体识别失败");
 if(!structureViewsPure)issues.unshift("下方结构展示区混入了产品本体");
 if(structureSimilarity<60)issues.unshift("成图外包装结构与上传参考偏差明显");
 if(productDominance>45)issues.unshift("产品本体占比过高，抢占外包装主体");
 const score=clamp(raw.score);
 const status=score<70||!outerPackageCorrect||!structureViewsPure||structureSimilarity<60||productDominance>45?"warning":"pass";
 return{status,score,outerPackageCorrect,structureSimilarity,productDominance,structureViewsPure,issues:[...new Set(issues)].slice(0,6),retryHint:String(raw.retryHint||"外包装作为唯一主对象，严格保持上传参考结构；产品仅作为小比例场景道具，下方只展示外包装结构视图。").trim(),reviewedAt:new Date().toISOString()};
}
async function reviewPackagingSubjectWithGemini(params:{imageUrl:string;structureImageUrl:string;structure:PackagingReferenceAnalysis}){
 const parts:Array<Record<string,unknown>>=[{text:`检查第一张外包装概念图，第二张为唯一结构参考。已确认结构：${params.structure.structureName}；${params.structure.structureSummary}；开合方式：${params.structure.openingMethod}；轮廓：${params.structure.outlineRatio}。检查：1) 主体是否确实为外包装，而不是产品本体、茶包、面膜袋、瓶器或设备；2) 结构与参考的相似度；3) 上方场景中产品本体是否喧宾夺主；4) 下方结构区是否只展示外包装${params.structure.viewMode==="two_view"?"正面和背面":"正面、侧面和背面"}。严格 JSON：{"score":0,"outerPackageCorrect":true,"structureSimilarity":0,"productDominance":0,"structureViewsPure":true,"issues":["问题"],"retryHint":"纠正主体的具体重生建议"}`}];
 parts.push(await imagePartFromSource(params.imageUrl),{text:"外包装结构参考"},await imagePartFromSource(params.structureImageUrl));
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"packaging-subject-review",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:"你是外包装主体与结构质量检查员。不要重生成图片，只输出严格 JSON。"}]},contents:[{role:"user",parts}],generationConfig:{temperature:.2,responseMimeType:"application/json",maxOutputTokens:1000}}});
 const text=result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
 return{data:parsePackagingSubjectReview(text),usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
async function imagePartFromSource(source:string){
 const dataMatch=source.match(/^data:([^;]+);base64,(.+)$/);if(dataMatch)return{inlineData:{mimeType:dataMatch[1],data:dataMatch[2]}};
 const response=await fetch(source);if(!response.ok)throw new Error(`参考图片请求失败（HTTP ${response.status}）`);
 const mimeType=response.headers.get("content-type")?.split(";")[0]||"image/jpeg";
 const bytes=new Uint8Array(await response.arrayBuffer());let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
 return{inlineData:{mimeType,data:btoa(binary)}};
}
function parseProductQualityReview(text:string,recentIds:string[]){
 const raw=JSON.parse(cleanJson(text)) as Record<string,unknown>;
 const clamp=(value:unknown)=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
 const score=clamp(raw.score),similarityScore=clamp(raw.similarityScore);
 const similarCandidateId=recentIds.includes(String(raw.similarCandidateId||""))?String(raw.similarCandidateId):undefined;
 const issues=(Array.isArray(raw.issues)?raw.issues:[]).map(String).map(item=>item.trim()).filter(Boolean).slice(0,6);
 const categoryCorrect=raw.categoryCorrect!==false,requiredViewsComplete=raw.requiredViewsComplete!==false,layoutCompliant=raw.layoutCompliant!==false,informationComplete=raw.informationComplete!==false;
 const logoConsistent=raw.logoConsistent!==false,logoFidelity=raw.logoFidelity===undefined?clamp(raw.brandQuality):clamp(raw.logoFidelity);
 const typographyQuality=raw.typographyQuality===undefined?clamp(raw.brandQuality):clamp(raw.typographyQuality);
 if(!categoryCorrect)issues.unshift("产品品类或器型与设计依据不一致");
 if(!requiredViewsComplete)issues.unshift("结构视图不完整或各视图并非同一设计");
 if(!layoutCompliant)issues.unshift("未遵守上方60%场景、下方40%结构展示的固定版式");
 if(!logoConsistent||logoFidelity<65)issues.unshift("成图 Logo 与定稿 Logo 的图形、字形、比例或组合关系偏差明显");
 if(typographyQuality<65)issues.unshift("包装文字层级、对齐或图文融合不足");
 if(!informationComplete)issues.unshift("产品表面的信息完整度不符合当前品类与器型");
 const status=score<70||similarityScore>=80||!categoryCorrect||!requiredViewsComplete||!layoutCompliant||!logoConsistent||logoFidelity<65||typographyQuality<65||!informationComplete?"warning":"pass";
 return{score,status,categoryCorrect,requiredViewsComplete,layoutCompliant,logoConsistent,logoFidelity,sceneQuality:clamp(raw.sceneQuality),brandQuality:clamp(raw.brandQuality),typographyQuality,informationComplete,similarityScore,...(similarCandidateId?{similarCandidateId}:{}),issues:[...new Set(issues)].slice(0,6),retryHint:String(raw.retryHint||"强参考定稿 Logo，严格保持图形、字形、比例和组合关系；同时采用上60%场景、下40%结构展示并提升字体层级与图文融合").trim(),reviewedAt:new Date().toISOString()};
}
async function reviewProductDesignWithGemini(params:{imageUrl:string;logoImageUrl:string;recentCandidates?:{id:string;imageUrl:string}[];category:string;productName:string;viewMode:string;informationProfileId?:string;informationCompletenessRule?:string;direction?:Record<string,unknown>}){
 const recent=(params.recentCandidates||[]).filter(item=>item.imageUrl).slice(0,3);
 const parts:Array<Record<string,unknown>>=[{text:`检查第一张新生成的 9:16 产品设计长图。第二张图片是不可改动的定稿 Logo 参考。产品为“${params.productName}”，品类“${params.category}”。固定版式必须是：上方约60%为一张连续完整的商业场景，下方约40%为独立结构展示区；只允许水平分界，禁止左右分栏、竖向切割、斜切、嵌入视图和上下互换。下方要求 ${params.viewMode==="two_view"?"正面+背面两视图":"正面+侧面+背面三视图"}，同尺度、同基线、完整不裁切。检查成图中的 Logo 与第二张定稿 Logo 的图形、字形、比例和组合关系是否一致。除 Logo 外，包装文字由 AI 自由设计，不检查内容准确性；只检查是否有层级、排版美感和图文融合，是否出现乱码式大段堆字、系统字段名、提示词、UI 或普通办公文档式排版。当前信息完整度配置为 ${params.informationProfileId||"custom_adaptive"}，必须按以下规则判断，不得用面膜袋标准检查所有产品：${params.informationCompletenessRule||"根据真实可印刷区域判断主识别面和辅助信息面是否完整"}。创意方向：${JSON.stringify(params.direction||{})}。后续图片是近期方案，按 ID 顺序 ${recent.map(item=>item.id).join("、")||"无"}，用于判断相似度。严格 JSON：{"score":0,"categoryCorrect":true,"requiredViewsComplete":true,"layoutCompliant":true,"logoConsistent":true,"logoFidelity":0,"sceneQuality":0,"brandQuality":0,"typographyQuality":0,"informationComplete":true,"similarityScore":0,"similarCandidateId":"候选ID或空","issues":["问题"],"retryHint":"一段可直接加入重生提示词的具体建议"}`}];
 parts.push(await imagePartFromSource(params.imageUrl),{text:"定稿 Logo 参考"},await imagePartFromSource(params.logoImageUrl));for(const item of recent)parts.push({text:`近期方案 ${item.id}`},await imagePartFromSource(item.imageUrl));
 const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"product-quality-review",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:"你是消费品工业设计与品牌视觉质量总监。客观检查图片，不迎合，不重生成图片，只输出严格 JSON。"}]},contents:[{role:"user",parts}],generationConfig:{temperature:.2,responseMimeType:"application/json",maxOutputTokens:1600}}});
 const text=result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
 return{data:parseProductQualityReview(text,recent.map(item=>item.id)),usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||0}};
}
function validatePackages(text:string,validInsightIds:string[],requiredPainIds:string[],baseCopyId?:string):CopyPackage[]{
 const parsed=JSON.parse(cleanJson(text)) as {packages?:unknown[]}; if(!Array.isArray(parsed.packages)||parsed.packages.length!==3)throw new Error("必须返回三套文案");
 const packages=parsed.packages.map((raw,index)=>{const item=raw as Partial<CopyPackage>;if(!Array.isArray(item.fields))throw new Error("文案字段缺失");const byKey=new Map(item.fields.map(f=>[f.key,f]));const fields=copyFieldKeys.map(key=>{const source=byKey.get(key) as CopyField|undefined;if(!source?.content)throw new Error(`缺少 ${key}`);const content=String(source.content).trim();if(prohibitedAdvertisingTerms.some(term=>content.includes(term)))throw new Error("包含广告法风险词");if(/经测试|实验室|斑贴测试|临床|研究表明|纯度|≥|\d+\s*%|\d+\s*周/.test(content))throw new Error("包含未提供的实验、浓度或周期数据");if(key==="main_slogan"&&[...content.replace(/[，。！？、,.!?\s]/g,"")].length>12)throw new Error("主标语超过12字");const linked=source.linkedInsightId&&validInsightIds.includes(source.linkedInsightId)?source.linkedInsightId:undefined;return{key,label:copyFieldLabels[key],content,...(linked?{linkedInsightId:linked}:{})};});const sourceInsightIds=[...new Set([...(item.sourceInsightIds||[]),...fields.flatMap(f=>f.linkedInsightId?[f.linkedInsightId]:[])])].filter(id=>validInsightIds.includes(id));return{id:`copy-ai-${Date.now()}-${index}`,directionName:String(item.directionName||["理性成分风","情绪共鸣风","简洁高端风"][index]),toneTags:Array.isArray(item.toneTags)?item.toneTags.map(String).slice(0,5):[],fields,sourceInsightIds,...(baseCopyId?{parentId:baseCopyId}:{}),round:1};});
 if(requiredPainIds.some(id=>!packages.some(item=>item.fields.some(field=>field.linkedInsightId===id))))throw new Error("存在未被三套文案共同覆盖的痛点 insight id");
 return packages;
}
async function chat(messages:{role:"system"|"user"|"assistant";content:string}[],provider:"deepseek"|"gemini"){
 if(provider==="gemini"){
  const system=messages.find(message=>message.role==="system")?.content||copySystemPrompt;
  const result=await fetchAiJson<GeminiPayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1beta/models/${aiServerConfig.yunwu.model}:generateContent`,apiKey:aiServerConfig.yunwu.apiKey,provider:"gemini",generator:"copy",timeoutMs:60000,authHeaders:{"x-goog-api-key":aiServerConfig.yunwu.apiKey},body:{systemInstruction:{parts:[{text:system}]},contents:messages.filter(message=>message.role!=="system").map(message=>({role:message.role==="assistant"?"model":"user",parts:[{text:message.content}]})),generationConfig:{temperature:.9,responseMimeType:"application/json",maxOutputTokens:5000}}});
  return{data:{choices:[{message:{content:result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||""}}]},usage:{provider:"gemini",durationMs:result.usage.durationMs,tokens:result.data.usageMetadata?.totalTokenCount||((result.data.usageMetadata?.promptTokenCount||0)+(result.data.usageMetadata?.candidatesTokenCount||0))}};
 }
 return fetchAiJson<DeepSeekPayload>({url:`${aiServerConfig.deepseek.baseUrl.replace(/\/$/,"")}/chat/completions`,apiKey:aiServerConfig.deepseek.apiKey,provider:"deepseek",generator:"copy",timeoutMs:60000,body:{model:aiServerConfig.deepseek.model,messages,temperature:.9,response_format:{type:"json_object"},max_tokens:5000}});
}
export async function POST(request:Request){
 try{const earlyBody=await request.clone().json();if(earlyBody.action==="product-design-quality"){if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"视觉质量检查需要配置 Gemini 兼容服务密钥"},{status:503});try{const result=await reviewProductDesignWithGemini(earlyBody.params);return Response.json(result);}catch(error){return Response.json({error:error instanceof Error?error.message:"视觉质量检查失败"},{status:502});}}}catch{}
 try{
  const earlyBody=await request.clone().json();
  if(earlyBody.action==="packaging-structure-identify"){
   if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"外包装结构识别需要配置 Gemini 兼容服务密钥"},{status:503});
   try{
    if(!earlyBody.params?.imageUrl)return Response.json({error:"缺少外包装结构参考图"},{status:400});
    return Response.json(await identifyPackagingStructureWithGemini(earlyBody.params));
   }catch(error){return Response.json({error:error instanceof Error?error.message:"外包装结构识别失败"},{status:502});}
  }
  if(earlyBody.action==="packaging-subject-review"){
   if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"外包装主体检查需要配置 Gemini 兼容服务密钥"},{status:503});
   try{
    if(!earlyBody.params?.imageUrl||!earlyBody.params?.structureImageUrl||!earlyBody.params?.structure)return Response.json({error:"外包装主体检查缺少成图或结构依据"},{status:400});
    return Response.json(await reviewPackagingSubjectWithGemini(earlyBody.params));
   }catch(error){return Response.json({error:error instanceof Error?error.message:"外包装主体检查失败"},{status:502});}
  }
 }catch{}
 try{
  const earlyBody=await request.clone().json();
  if(earlyBody.action==="packaging-design-prompt"){
   if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"外包装参考图分析需要配置 Gemini 兼容服务密钥"},{status:503});
   try{
    const params=earlyBody.params;
    if(!params?.boxType?.referenceImageUrl)return Response.json({error:"缺少已确认的外包装参考图"},{status:400});
    if(!params?.boxType?.referenceAnalysis)return Response.json({error:"请先完成外包装结构识别并确认结构"},{status:400});
    if(!params?.logoImageUrl)return Response.json({error:"缺少定稿 Logo 原图"},{status:400});
    const images=[
     {name:"外包装结构参考图",dataUrl:String(params.boxType.referenceImageUrl)},
     {name:"定稿 Logo",dataUrl:String(params.logoImageUrl)},
    ];
    const result=await packagingPromptWithGemini(buildPackagingDesignPrompt(params),images);
    const count=Math.max(1,Math.min(5,Number(params.count)||1));
    const parsed=JSON.parse(cleanJson(result.content)) as {directions?:unknown[]};
    if(!Array.isArray(parsed.directions)||parsed.directions.length!==count)throw new Error(`AI 应返回 ${count} 条包装设计提示词`);
    const directions=parsed.directions.map((raw,index)=>{
     const item=(raw||{}) as Record<string,unknown>;
     if(item.subjectType!=="outer_package")throw new Error(`方向 ${index+1} 的主体不是外包装`);
     const canonicalStructure=String(params.boxType.referenceAnalysis.structureSummary||"").trim();
     const sourcePrompt=String(item.promptZh||"").trim();
     const hardConstraint=`【不可编辑主体约束】唯一主对象是外包装；严格保持“${canonicalStructure}”；上方场景产品本体最多作为小比例道具；下方只展示外包装结构视图，禁止产品本体进入。`;
     const promptZh=`${sourcePrompt}\n\n${hardConstraint}`;
     if(promptZh.length<120)throw new Error(`方向 ${index+1} 的包装效果提示词过短`);
     return{subjectType:"outer_package" as const,structureSummary:canonicalStructure,directionName:String(item.directionName||`方向 ${index+1}`).trim(),designSummary:String(item.designSummary||"").trim(),promptZh};
    });
    if(new Set(directions.map(item=>item.promptZh)).size!==directions.length)throw new Error("AI 返回了重复的包装设计提示词");
    return Response.json({data:{directions},usage:result.usage});
   }catch(error){return Response.json({error:error instanceof Error?error.message:"包装效果提示词生成失败"},{status:502});}
  }
 }catch{}
 try{const earlyBody=await request.clone().json();if(earlyBody.action==="product-copy-layout"){const provider=earlyBody.provider==="gemini"?"gemini":"deepseek";if(provider==="deepseek"&&!aiServerConfig.deepseek.apiKey)return Response.json({error:"DeepSeek 密钥未配置"},{status:503});if(provider==="gemini"&&!aiServerConfig.yunwu.apiKey)return Response.json({error:"Gemini 兼容服务密钥未配置"},{status:503});try{const params=earlyBody.params as {brief:Parameters<typeof buildProductCopyLayoutPrompt>[0]["brief"];fields:CopyField[];container?:Parameters<typeof buildProductCopyLayoutPrompt>[0]["container"];viewMode:"two_view"|"three_view"};const prompt=buildProductCopyLayoutPrompt(params);const first=await chat([{role:"system",content:productCopyLayoutSystemPrompt},{role:"user",content:prompt}],provider);const content=first.data.choices?.[0]?.message?.content||"";let data;let usage=first.usage;try{data=parseProductCopyLayout(content,params.fields,params.viewMode);}catch(error){const repair=await chat([{role:"system",content:productCopyLayoutSystemPrompt},{role:"user",content:prompt},{role:"assistant",content},{role:"user",content:`上次规划未通过校验：${error instanceof Error?error.message:"格式错误"}。不得新增事实，必须逐个返回所有 sourceKey，并输出严格 JSON。`}],provider);usage={...repair.usage,tokens:(first.usage.tokens||0)+(repair.usage.tokens||0)};data=parseProductCopyLayout(repair.data.choices?.[0]?.message?.content||"",params.fields,params.viewMode);}return Response.json({data,usage});}catch(error){return Response.json({error:error instanceof Error?error.message:"包装上版规划失败"},{status:502});}}}catch{}
 try{const earlyBody=await request.clone().json();if(earlyBody.action==="structure-identify"){if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"上传图片识别需要配置 Gemini 兼容服务密钥"},{status:503});try{const params=earlyBody.params as {brief:Parameters<typeof buildProductStructureIdentificationPrompt>[0];imageUrl:string};const result=await identifyStructureWithGemini(buildProductStructureIdentificationPrompt(params.brief),params.imageUrl);return Response.json({data:parseStructureRecommendations(result.content,1),usage:result.usage});}catch(error){return Response.json({error:error instanceof Error?error.message:"上传结构识别失败"},{status:502});}}}catch{}
 try{
  const earlyBody=await request.clone().json();
  if(earlyBody.action==="product-design-prompts"){
   const params=earlyBody.params;
   const fixedLogo=params?.fixedLogoReference;
   const referenceImages=Array.isArray(params?.referenceImages)?params.referenceImages.slice(0,10):[];
   const referenceIds=referenceImages.map((item:{id?:unknown},index:number)=>String(item.id||`ref-${index+1}`));
   if(!fixedLogo?.dataUrl)return Response.json({error:"缺少定稿 Logo 原图，无法生成产品设计方向"},{status:400});
   if(!aiServerConfig.yunwu.apiKey)return Response.json({error:"定稿 Logo 视觉分析需要配置 Gemini 兼容服务密钥"},{status:503});
   try{
    const count=Math.max(1,Math.min(5,Number(params.count)||1));
    const prompt=buildProductDesignDirectionPrompt({...params,count});
    const analysisImages=[fixedLogo,...referenceImages];
    const run=(text:string)=>designPromptsWithGemini(text,analysisImages);
    const first=await run(prompt);
    const content=first.data.choices?.[0]?.message?.content||"";
    let directions;
    let usage=first.usage;
    try{
     directions=parseProductDesignDirections(content,count,referenceIds);
    }catch(error){
     const repairPrompt=`${prompt}\n\n上次结果未通过校验：${error instanceof Error?error.message:"JSON格式错误"}。重新返回完整严格 JSON。定稿 Logo 必须作为每个方向的唯一固定视觉标识；copyAdaptations 必须为空数组。除 Logo 外文字由 AI 自由设计，不得引用第3步文案或系统字段名。构图固定为上方60%单一商业场景、下方40%结构视图；禁止左右分栏、斜切和嵌入视图。不同方向在配色、图形、字体系统、工艺、场景和视觉性格中至少四项明显不同。`;
     const repair=await run(repairPrompt);
     usage={...repair.usage,tokens:(first.usage.tokens||0)+(repair.usage.tokens||0)};
     directions=parseProductDesignDirections(repair.data.choices?.[0]?.message?.content||"",count,referenceIds);
    }
    return Response.json({data:directions,usage});
   }catch(error){
    return Response.json({error:error instanceof Error?error.message:"设计提示词生成失败"},{status:502});
   }
  }
 }catch{}
 try{const body=await request.json();const provider=body.provider==="gemini"?"gemini":"deepseek";if(provider==="deepseek"&&!aiServerConfig.deepseek.apiKey)return Response.json({error:"DeepSeek 密钥未配置"},{status:503});if(provider==="gemini"&&!aiServerConfig.yunwu.apiKey)return Response.json({error:"Gemini 兼容服务密钥未配置"},{status:503});if(body.action==="brief-import"){const params=body.params as {documentText:string;projectId:string;fileName:string};if(!params.documentText?.trim())return Response.json({error:"文档文字为空"},{status:400});const prompt=buildBriefImportPrompt(params.documentText,params.projectId,params.fileName);const first=await chat([{role:"system",content:briefImportSystemPrompt},{role:"user",content:prompt}],provider);const content=first.data.choices?.[0]?.message?.content||"";let brief;let usage=first.usage;try{brief=parseImportedBrief(content,params.projectId);}catch(error){const repair=await chat([{role:"system",content:briefImportSystemPrompt},{role:"user",content:prompt},{role:"assistant",content},{role:"user",content:`上次结果未通过校验：${error instanceof Error?error.message:"JSON 格式错误"}。请只依据原文，补齐所有必需对象和数组；缺失字段用空值，重新返回严格 JSON。`}],provider);usage={...repair.usage,tokens:(first.usage.tokens||0)+(repair.usage.tokens||0)};brief=parseImportedBrief(repair.data.choices?.[0]?.message?.content||"",params.projectId);}return Response.json({data:brief,usage});}if(body.action==="structure-recommend"){const params=body.params as {brief:Parameters<typeof buildProductStructurePrompt>[0];count?:number};const prompt=buildProductStructurePrompt(params.brief,params.count);const first=await chat([{role:"system",content:productStructureSystemPrompt},{role:"user",content:prompt}],provider);const content=first.data.choices?.[0]?.message?.content||"";let recommendations;let usage=first.usage;try{recommendations=parseStructureRecommendations(content);}catch(error){const repair=await chat([{role:"system",content:productStructureSystemPrompt},{role:"user",content:prompt},{role:"assistant",content},{role:"user",content:`上次输出未通过校验：${error instanceof Error?error.message:"JSON 格式错误"}。请重新返回完整严格 JSON。`}],provider);usage={...repair.usage,tokens:(first.usage.tokens||0)+(repair.usage.tokens||0)};recommendations=parseStructureRecommendations(repair.data.choices?.[0]?.message?.content||"");}return Response.json({data:recommendations,usage});}if(body.action==="rewrite"){const prompt=buildRewritePrompt(body.params);const result=await chat([{role:"system",content:copySystemPrompt},{role:"user",content:prompt}],provider);const content=result.data.choices?.[0]?.message?.content||"";const parsed=JSON.parse(cleanJson(content)) as {alternatives?:string[]};if(!Array.isArray(parsed.alternatives)||parsed.alternatives.length<3)throw new Error("重写结果格式不正确");return Response.json({data:parsed.alternatives.slice(0,3),usage:result.usage});}
 const params=body.params;const validIds=params.brief.insights.map((item:{id:string})=>item.id);const painIds=params.brief.insights.filter((item:{type:string})=>item.type==="pain_point").map((item:{id:string})=>item.id);const prompt=buildCopyGenerationPrompt(params);const first=await chat([{role:"system",content:copySystemPrompt},{role:"user",content:prompt}],provider);const content=first.data.choices?.[0]?.message?.content||"";let packages:CopyPackage[];let usage=first.usage;try{packages=validatePackages(content,validIds,painIds,params.baseCopyId);}catch(error){const repair=await chat([{role:"system",content:copySystemPrompt},{role:"user",content:prompt},{role:"assistant",content},{role:"user",content:`上次输出未通过校验：${error instanceof Error?error.message:"格式错误"}。请删除所有未由 Brief 提供的百分比、浓度、周期、测试和实验数据；确保全部痛点 id 在三套方案中至少各被一条文案直接关联，然后重新输出完整严格 JSON。`}],provider);usage={...repair.usage,tokens:(first.usage.tokens||0)+(repair.usage.tokens||0)};packages=validatePackages(repair.data.choices?.[0]?.message?.content||"",validIds,painIds,params.baseCopyId);}return Response.json({data:packages,usage});
 }catch(error){return Response.json({error:`AI 上游调用失败：${error instanceof Error?error.message:"未知错误"}`},{status:424});}
}
