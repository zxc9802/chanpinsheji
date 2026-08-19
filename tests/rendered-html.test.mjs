import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("step four removes copy selection while legacy layout data remains readable",async()=>{
  const [page,types]=await Promise.all([
    read("../components/product-design-page.tsx"),
    read("../types/product-design.ts"),
  ]);
  assert.match(types,/interface ProductCopyLayoutPlan/);
  assert.match(types,/confirmed: boolean/);
  assert.match(types,/interface ProductCopyReferenceItem/);
  assert.doesNotMatch(page,/选择供 AI 参考的内容/);
  assert.doesNotMatch(page,/buildProductCopyReferences/);
  assert.doesNotMatch(page,/copyProject/);
  assert.match(page,/包装文字由 AI 自由完成/);
  assert.doesNotMatch(page,/请先确认上版规划/);
  assert.doesNotMatch(page,/copyLayoutPlan\?\.confirmed/);
});

test("flexible packs have one canonical two-view decision",async()=>{
  const [viewMode,page]=await Promise.all([read("../services/product-view-mode.ts"),read("../components/product-design-page.tsx")]);
  assert.match(viewMode,/kind==="flexible_pack"\)return"two_view"/);
  assert.match(viewMode,/item\.face==="side"\?\{\.\.\.item,face:"back"/);
  assert.match(page,/inferProductStructureKind\(brief/);
  assert.match(page,/resolveProductViewMode\(brief/);
});

test("direct AI prompt uses free typography, a fixed logo and the 9:16 vertical composition",async()=>{
  const prompts=await read("../services/prompts/image-prompts.ts");
  assert.match(prompts,/buildProductDirectPrompt/);
  assert.doesNotMatch(prompts,/candidate\.copyAdaptations/);
  assert.match(prompts,/上方严格占画面 60%/);
  assert.match(prompts,/下方严格占画面 40%/);
  assert.match(prompts,/严禁左右分栏/);
  assert.match(prompts,/typographySystem/);
  assert.match(prompts,/第 2 张是不可改动的定稿 Logo 强参考/);
  assert.match(prompts,/包装上的所有可见文字由 AI 自由创作/);
  assert.match(prompts,/不读取或复述第 3 步文案/);
  assert.match(prompts,/不要默认极简、高端、克制/);
  assert.match(prompts,/系统字段名/);
});

test("new product candidates use one direct AI image without a programmatic text overlay",async()=>{
  const [generator,types]=await Promise.all([read("../services/product-image-generator.ts"),read("../types/product-design.ts")]);
  assert.doesNotMatch(generator,/faceCopyOverlay/);
  assert.doesNotMatch(generator,/rasterizeComposedView/);
  assert.match(generator,/buildProductDirectPrompt/);
  assert.match(generator,/renderMode:"direct_ai"/);
  assert.match(generator,/sourceViews:\[\]/);
  assert.match(generator,/size:"1024x1536",quality:"high"/);
  assert.match(generator,/canvas\.width=1080/);
  assert.match(generator,/canvas\.height=1920/);
  assert.match(generator,/Math\.min\(canvas\.width\/image\.naturalWidth,canvas\.height\/image\.naturalHeight\)/);
  assert.match(types,/composedViews\?: ProductDesignView\[\]/);
  assert.match(types,/renderMode\?: "legacy_composite" \| "direct_ai"/);
});

test("old candidates can be regenerated without overwriting history",async()=>{
  const page=await read("../components/product-design-page.tsx");
  assert.match(page,/按 AI 直出重生/);
  assert.match(page,/新方案位于第一位，原方案仍保留/);
  assert.match(page,/candidates:\[pending,\.\.\.current\.candidates\]/);
});

test("copy layout planning UI and its confirmation gate are removed",async()=>{
  const page=await read("../components/product-design-page.tsx");
  assert.doesNotMatch(page,/copy-layout-workbench/);
  assert.doesNotMatch(page,/setCopyLayoutExpanded/);
  assert.doesNotMatch(page,/展开查看或修改/);
  assert.doesNotMatch(page,/上版规划已确认/);
  assert.doesNotMatch(page,/productCopyLayoutGenerator/);
  assert.doesNotMatch(page,/已跳过器型上传/);
});

test("the final logo is a mandatory reference while user references stay optional",async()=>{
  const [page,route,generator]=await Promise.all([read("../components/product-design-page.tsx"),read("../app/api/ai/copy/route.ts"),read("../services/product-image-generator.ts")]);
  assert.match(page,/定稿 Logo · 必用/);
  assert.match(page,/fixedLogoReference:\{id:"fixed-final-logo"/);
  assert.match(page,/不可删除、不计入 10 张额度/);
  assert.match(page,/referenceImages: productDesign\.designReferenceImages\.map/);
  assert.match(route,/designPromptsWithGemini/);
  assert.match(route,/analysisImages=\[fixedLogo,\.\.\.referenceImages\]/);
  assert.match(route,/inlineData/);
  assert.match(page,/toggleDirectionReference/);
  assert.match(page,/designReferenceImages:selectedReferences/);
  assert.match(generator,/params\.designReferenceImages/);
  assert.match(generator,/params\.finalLogo\.imageUrl/);
  assert.match(generator,/createReferenceBoard/);
  assert.match(generator,/referenceImageGroups:candidates\.map\(\(\)=>sharedReferences\)/);
});

test("design directions are open creative, reference-optional and differ on at least four axes",async()=>{
  const [types,route,prompt,diversity]=await Promise.all([read("../types/product-design.ts"),read("../app/api/ai/copy/route.ts"),read("../services/prompts/product-design-direction-prompt.ts"),read("../services/product-design-diversity.ts")]);
  assert.match(types,/creativeConcept/);
  assert.match(types,/visualPersonality/);
  assert.match(types,/designRationale/);
  assert.match(types,/copyAdaptations/);
  assert.match(types,/referenceImageIds/);
  assert.match(prompt,/每个方向可选 0–3 张/);
  assert.match(prompt,/至少四项明显不同/);
  assert.match(prompt,/视觉风格完全开放/);
  assert.match(prompt,/上方 60% 为一张连续完整的商业场景/);
  assert.match(prompt,/typographySystem/);
  assert.match(prompt,/copyAdaptations":\[\]/);
  assert.match(route,/directionDifferenceCount/);
  assert.match(route,/不足四项差异/);
  assert.doesNotMatch(route,/必须选择 1–3 张有效参考图/);
  assert.match(diversity,/open_creative/);
  assert.match(diversity,/fixedProductPresentationLayout/);
  assert.match(diversity,/hero_top_views_bottom/);
});

test("quality review is asynchronous and its diagnostics stay out of candidate cards",async()=>{
  const [page,types,route,reviewer]=await Promise.all([read("../components/product-design-page.tsx"),read("../types/product-design.ts"),read("../app/api/ai/copy/route.ts"),read("../services/product-design-quality-reviewer.ts")]);
  assert.match(types,/ProductDesignQualityReview/);
  assert.match(types,/similarityScore/);
  assert.match(types,/layoutCompliant/);
  assert.match(types,/logoFidelity/);
  assert.match(types,/logoConsistent/);
  assert.match(types,/typographyQuality/);
  assert.match(types,/informationComplete/);
  assert.match(page,/startQualityReview\(completed\)/);
  assert.doesNotMatch(page,/Logo 强参考未通过/);
  assert.doesNotMatch(page,/文字排版 \d+ 分/);
  assert.match(page,/该方案未通过固定上下版式检查/);
  assert.match(page,/该方案的信息设计不符合当前产品品类与器型/);
  assert.match(page,/nextDiverseSnapshot/);
  assert.match(route,/product-design-quality/);
  assert.match(route,/上方约60%为一张连续完整的商业场景/);
  assert.match(route,/定稿 Logo 参考/);
  assert.match(route,/logoFidelity/);
  assert.match(route,/typographyQuality/);
  assert.match(route,/informationCompletenessRule/);
  assert.match(route,/informationComplete/);
  assert.match(reviewer,/logoImageUrl/);
  assert.match(reviewer,/recentCandidates/);
  assert.match(reviewer,/resolveProductInformationCompleteness/);
  assert.doesNotMatch(page,/qualityReview.*自动重生/);
});

test("product information completeness adapts to category and structure",async()=>{
  const [rules,directionPrompt,imagePrompt]=await Promise.all([
    read("../services/product-information-completeness.ts"),
    read("../services/prompts/product-design-direction-prompt.ts"),
    read("../services/prompts/image-prompts.ts"),
  ]);
  assert.match(rules,/flexible_pack_full/);
  assert.match(rules,/背面必须是一套完成度高的包装信息系统/);
  assert.match(rules,/背面不得空白、只放 Logo、只放一行字或仅延续正面图案/);
  assert.match(rules,/solid_product_minimal/);
  assert.match(rules,/不得套用成分表、功效说明或大段包装背标/);
  assert.match(rules,/机身大面积留白可以是合理设计/);
  assert.match(rules,/container_label/);
  assert.match(rules,/真实可印刷区域/);
  assert.match(rules,/brief\.product\.texture/);
  assert.match(directionPrompt,/resolveProductInformationCompleteness/);
  assert.match(directionPrompt,/当前产品的信息完整度规则/);
  assert.doesNotMatch(directionPrompt,/不要求内容准确或完整/);
  assert.match(imagePrompt,/resolveProductInformationCompleteness/);
  assert.match(imagePrompt,/当前产品的信息完整度规则/);
  assert.doesNotMatch(imagePrompt,/不要求文字准确或完整/);
});

test("render version nine clears old prompts while keeping historic candidates",async()=>{
  const [provider,types]=await Promise.all([read("../components/design-brief-provider.tsx"),read("../types/product-design.ts")]);
  assert.match(types,/renderVersion: 9/);
  assert.match(provider,/migrateProductDesign/);
  assert.match(provider,/renderVersion:9/);
  assert.match(provider,/fidelityFor/);
  assert.match(provider,/typographySystem/);
  assert.match(provider,/fixedProductPresentationLayout/);
  assert.match(provider,/input\.renderVersion===9\?input\.designPrompts\|\|\[\]:\[\]/);
  assert.match(provider,/selectedCopyFieldKeys:\[\]/);
  assert.match(provider,/candidates:\(input\.candidates\|\|\[\]\)\.map/);
});

test("direct product images run in a three-worker queue and expose retryable per-image status",async()=>{
  const [page,types]=await Promise.all([read("../components/product-design-page.tsx"),read("../types/product-design.ts")]);
  assert.match(types,/ProductDirectGenerationStatus/);
  assert.match(page,/Math\.min\(3, confirmedPrompts\.length\)/);
  assert.match(page,/candidates: \[completed, \.\.\.current\.candidates\]/);
  assert.match(page,/等待生成/);
  assert.match(page,/正在整理参考图/);
  assert.match(page,/正在上传参考图/);
  assert.match(page,/AI 正在生成/);
  assert.match(page,/只重试这张/);
  assert.match(page,/retryGenerationJob/);
});

test("large preview provides the confirmed source copy for manual comparison",async()=>{
  const page=await read("../components/product-design-page.tsx");
  assert.match(page,/已确认的原始文案（请与 AI 图片人工核对）/);
  assert.match(page,/来源原文/);
  assert.match(page,/AI 直出适合概念设计展示，不作为印刷准确文件/);
});

test("prompt cards hide internal strategy and face-summary blocks while preserving backend data",async()=>{
  const [page,styles,types]=await Promise.all([read("../components/product-design-page.tsx"),read("../app/product-copy-layout.css"),read("../types/product-design.ts")]);
  assert.doesNotMatch(page,/prompt-strategy-summary/);
  assert.doesNotMatch(page,/prompt-face-summary-details/);
  assert.doesNotMatch(page,/查看本方向采用的上版内容/);
  assert.doesNotMatch(styles,/prompt-face-summary-details/);
  assert.match(types,/surfaceCmf/);
  assert.match(types,/typographySystem/);
  assert.match(types,/copyAdaptations/);
});

test("new prompts ignore step-three copy and let AI design all text except the logo",async()=>{
  const [types,prompt,route,generator]=await Promise.all([
    read("../types/product-design.ts"),
    read("../services/prompts/product-design-direction-prompt.ts"),
    read("../app/api/ai/copy/route.ts"),
    read("../services/product-image-generator.ts"),
  ]);
  assert.match(types,/finalCopy\?:/);
  assert.match(prompt,/不读取或复述第 3 步文案/);
  assert.match(prompt,/所有可见文字.*由你自由设计/);
  assert.match(prompt,/定稿 Logo 是唯一固定的视觉标识/);
  assert.doesNotMatch(prompt,/copyReferences/);
  assert.doesNotMatch(route,/copyReferences=Array\.isArray\(params\.copyReferences\)/);
  assert.match(route,/copyAdaptations 必须为空数组/);
  assert.match(generator,/copyApplied: \[\]/);
  assert.match(generator,/copyAdaptations:\[\]/);
});

test("product structure workflow defaults to a confirmed uploaded reference",async()=>{
  const [page,types,provider]=await Promise.all([
    read("../components/product-design-page.tsx"),
    read("../types/product-design.ts"),
    read("../components/design-brief-provider.tsx"),
  ]);
  assert.match(types,/structureMode:"reference"/);
  assert.match(provider,/structureMode:"reference"/);
  assert.match(page,/<h2>上传产品或器型参考图<\/h2>/);
  assert.doesNotMatch(page,/跳过器型，由 AI 自动设计/);
  assert.doesNotMatch(page,/chooseStructureMode/);
  assert.match(page,/selectedContainer\?\.source==="upload"/);
  assert.match(page,/structureConfirmed/);
});

test("step five directly generates multiple AI packaging concepts from fixed logo and product references",async()=>{
  const [page,types,generator,provider,delivery]=await Promise.all([
    read("../components/packaging-design-page.tsx"),
    read("../types/packaging.ts"),
    read("../services/packaging-generator.ts"),
    read("../components/design-brief-provider.tsx"),
    read("../components/delivery-page.tsx"),
  ]);
  assert.match(page,/定稿 Logo · 必用/);
  assert.match(page,/定稿产品图 · 必用/);
  assert.match(page,/用户外包装设计要求/);
  assert.match(page,/generationCount/);
  assert.match(page,/finalProductDesign:\{ imageUrl: finalProduct\.imageUrl/);
  assert.doesNotMatch(page,/uploadBoxReference|packagingStructureAnalyzer|packagingQualityReviewer/);
  assert.doesNotMatch(page,/packagingDesignPromptGenerator|promptOptions|structureConfirmed/);
  assert.match(page,/pack-effect-preview-modal/);
  assert.match(page,/previewZoom/);
  assert.match(page,/preview-zoom-toolbar/);
  assert.match(page,/preview-zoom-stage/);
  assert.match(page,/onWheel/);
  assert.match(page,/加入已选/);
  assert.match(types,/renderMode\?: "legacy_dieline" \| "direct_ai_preview"/);
  assert.match(types,/aiGeneratedPackagingBoxTypeId/);
  assert.match(types,/promptVersion: 3/);
  assert.match(generator,/directPreviewPrompt/);
  assert.match(generator,/renderMode:"direct_ai_preview"/);
  assert.match(generator,/size:"1024x1536"/);
  assert.doesNotMatch(generator,/composeTexture/);
  assert.doesNotMatch(generator,/previewSvg/);
  assert.match(generator,/params\.finalLogo\.imageUrl/);
  assert.match(generator,/params\.finalProductDesign\.imageUrl/);
  assert.match(generator,/产品图仅用于提取配色、材质、表面工艺、光线与品牌氛围/);
  assert.doesNotMatch(generator,/外包装结构参考/);
  assert.match(provider,/aiGeneratedBoxType/);
  assert.match(provider,/migratePackagingProject/);
  assert.match(provider,/promptVersion:3/);
  assert.match(delivery,/03_外包装设计\/外包装效果图\.\$\{packagingFile\.extension\}/);
  assert.doesNotMatch(delivery,/刀版示意图/);
  assert.doesNotMatch(delivery,/包装展开布局/);
});

test("step one no longer exposes or requires packaging language",async()=>{
  const [form,provider,logoGenerator,logoPrompt,copyPrompt,packaging,importPrompt]=await Promise.all([
    read("../components/brief-form.tsx"),
    read("../components/design-brief-provider.tsx"),
    read("../services/logo-generator.ts"),
    read("../services/prompts/image-prompts.ts"),
    read("../services/prompts/copy-prompts.ts"),
    read("../services/packaging-generator.ts"),
    read("../services/prompts/brief-import-prompt.ts"),
  ]);
  assert.doesNotMatch(form,/包装语言/);
  assert.doesNotMatch(form,/errors\.styleKeywords/);
  assert.doesNotMatch(form,/\["styleKeywords", brief\.styleKeywords/);
  assert.doesNotMatch(form,/const styles =/);
  assert.doesNotMatch(provider,/brief: \{ \.\.\.old\.brief, styleKeywords/);
  assert.doesNotMatch(logoGenerator,/brief\.styleKeywords/);
  assert.doesNotMatch(logoPrompt,/brief\.styleKeywords/);
  assert.doesNotMatch(copyPrompt,/brief\.styleKeywords/);
  assert.doesNotMatch(packaging,/brief\.styleKeywords/);
  assert.match(importPrompt,/styleKeywords 为兼容旧数据固定返回空数组/);
});

test("logo generation is manual and appends each completed image immediately",async()=>{
  const [page,generator,client,imageRoute,jobManager]=await Promise.all([
    read("../components/logo-design-page.tsx"),
    read("../services/logo-generator.ts"),
    read("../lib/ai-client.ts"),
    read("../app/api/ai/image/route.ts"),
    read("../lib/image-job-manager.ts"),
  ]);
  assert.doesNotMatch(page,/useEffect|autoStarted/);
  assert.match(page,/onCandidate:/);
  assert.match(page,/完成一张即显示一张/);
  assert.match(generator,/onCandidate\?\.\(candidate\)/);
  assert.match(generator,/onProgress:\(partialUrls\)=>partialUrls\.forEach\(publishCandidate\)/);
  assert.match(client,/onProgress\?\.\(payload\.result\.data\)/);
  assert.match(imageRoute,/onImage\?\.\(index\+offset,result\)/);
  assert.match(jobManager,/publishProgress/);
});

test("workflow is reduced to six steps and legacy step seven redirects",async()=>{
  const [route,shell,packaging]=await Promise.all([
    read("../app/workflow/[step]/page.tsx"),
    read("../components/workflow-shell.tsx"),
    read("../components/packaging-design-page.tsx"),
  ]);
  assert.match(route,/parsed === 7/);
  assert.match(route,/router\.replace\("\/workflow\/6"\)/);
  assert.doesNotMatch(route,/MarketingImagePage/);
  assert.match(shell,/质检与交付/);
  assert.doesNotMatch(shell,/图片生成/);
  assert.match(shell,/completedCount \/ 6/);
  assert.doesNotMatch(shell,/结构资产库/);
  assert.doesNotMatch(shell,/AI 服务/);
  assert.match(packaging,/进入质检与交付/);
  assert.match(packaging,/router\.push\("\/workflow\/6"\)/);
});

test("delivery exports exactly three core images and three project documents",async()=>{
  const [delivery,quality,provider]=await Promise.all([
    read("../components/delivery-page.tsx"),
    read("../services/quality-checker.ts"),
    read("../components/design-brief-provider.tsx"),
  ]);
  assert.match(delivery,/01_Logo\/定稿Logo\.\$\{logoFile\.extension\}/);
  assert.match(delivery,/02_产品设计\/产品概念图\.\$\{productFile\.extension\}/);
  assert.match(delivery,/03_外包装设计\/外包装效果图\.\$\{packagingFile\.extension\}/);
  assert.match(delivery,/createProjectPdf/);
  assert.match(delivery,/04_项目资料\/项目简报\.pdf/);
  assert.match(delivery,/04_项目资料\/定稿文案\.pdf/);
  assert.match(delivery,/04_项目资料\/质检报告\.pdf/);
  assert.match(delivery,/assetCount: 6/);
  assert.doesNotMatch(delivery,/marketingImages|saveTemplate/);
  assert.doesNotMatch(quality,/marketing/i);
  assert.match(quality,/核心视觉资产/);
  assert.match(provider,/completedSteps: \[\.\.\.new Set\(\[\.\.\.old\.completedSteps\.filter\(\(step\) => step <= 5\), 6\]\)\]/);
});

test("step one document import always uses OpenLux gpt-5.6-luna",async()=>{
  const [config,importer,route,form,prompt]=await Promise.all([
    read("../lib/ai-config.ts"),
    read("../services/document-brief-importer.ts"),
    read("../app/api/ai/copy/route.ts"),
    read("../components/brief-form.tsx"),
    read("../services/prompts/brief-import-prompt.ts"),
  ]);
  assert.match(config,/model: process\.env\.OPENLUX_MODEL \|\| "gpt-5.6-luna"/);
  assert.match(config,/https:\/\/api\.openlux\.ai\/v1/);
  assert.match(importer,/provider: "openlux"/);
  assert.match(importer,/importBriefFromImages/);
  assert.doesNotMatch(importer,/getAiProvider\("copy"\)/);
  assert.match(route,/provider==="openlux"/);
  assert.match(route,/"openlux","brief-import"/);
  assert.match(route,/image_url/);
  assert.match(prompt,/briefImportImageSystemPrompt/);
  assert.match(form,/导入文档 \/ 图片/);
  assert.match(form,/importBriefFromImages/);
  assert.match(form,/AI 生成/);
  assert.match(form,/importParsedBrief/);
  assert.match(prompt,/briefFillSystemPrompt/);
  assert.match(route,/fillMissingBriefFields/);
});
