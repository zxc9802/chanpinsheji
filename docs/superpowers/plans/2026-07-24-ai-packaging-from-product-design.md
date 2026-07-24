# AI Packaging From Product Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Step 5's uploaded-box workflow with direct multi-candidate packaging generation from a user requirement, the finalized Logo image, and the finalized product image.

**Architecture:** Step 5 owns one editable user requirement and a candidate count. The image generator receives two immutable references in a fixed order: Logo first and product image second. A new synthetic box metadata record keeps candidate finalization and delivery compatible while the model freely designs each package structure.

**Tech Stack:** Next.js/React 19, TypeScript, existing `/api/ai/image` job API, Node built-in test runner.

---

### Task 1: Write the Step 5 regression contract

**Files:**
- Modify: `tests/rendered-html.test.mjs:244-330`

- [ ] **Step 1: Replace the two legacy Step 5 assertions with the direct-input contract**

  Replace the tests named `step five uses an uploaded outer-package reference instead of the built-in box grid` and `step five creates editable direct-AI packaging effect previews without dielines` with:

  ```js
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
    assert.match(types,/aiGeneratedPackagingBoxTypeId/);
    assert.match(types,/promptVersion: 3/);
    assert.match(generator,/params\.finalLogo\.imageUrl/);
    assert.match(generator,/params\.finalProductDesign\.imageUrl/);
    assert.match(generator,/产品图仅用于提取配色、材质、表面工艺、光线与品牌氛围/);
    assert.doesNotMatch(generator,/外包装结构参考/);
    assert.match(provider,/aiGeneratedBoxType/);
    assert.match(provider,/promptVersion:3/);
    assert.match(delivery,/03_外包装设计\/外包装效果图/);
  });
  ```

- [ ] **Step 2: Run the focused test and verify that it fails**

  Run: `node --test tests/rendered-html.test.mjs`

  Expected: the new Step 5 test fails because the page still imports upload, prompt-generation, and structure-review code.

- [ ] **Step 3: Commit the test-only change**

  ```bash
  git add tests/rendered-html.test.mjs
  git commit -m "test: define direct AI packaging workflow"
  ```

### Task 2: Establish AI-generated packaging state and migration

**Files:**
- Modify: `types/packaging.ts:13-133`
- Modify: `services/packaging-generator.ts:36-56`
- Modify: `components/design-brief-provider.tsx:96-110`
- Modify: `components/design-brief-provider.tsx:393-422`

- [ ] **Step 1: Add a stable synthetic package identifier and make the new state version explicit**

  In `types/packaging.ts`, add the identifier before `PackagingGenParams`, extend `BoxType.source`, and make new projects version 3:

  ```ts
  export const aiGeneratedPackagingBoxTypeId = "ai-generated-package";

  export interface PackagingGenParams {
    brief: DesignBrief;
    finalLogo: { imageUrl: string; styleTags: string[] };
    finalCopy?: CopyPackage;
    finalProductDesign: { imageUrl: string; cmf: { colorScheme: string[]; material: string; finish: string } };
    boxTypeId?: string;
    boxType?: BoxType;
    basePackagingId?: string;
    basePackagingImageUrl?: string;
    designPrompt?: string;
    directionName?: string;
    count: number;
    variationHint?: PackagingVariationHint;
  }

  // BoxType.source becomes "builtin" | "upload" | "ai".
  // PackagingProjectState.promptVersion becomes 3.
  // emptyPackagingProject sets promptVersion: 3, selectedBoxTypeId:
  // aiGeneratedPackagingBoxTypeId, designRequirement: "", generationCount: 3.
  ```

- [ ] **Step 2: Define one `aiGeneratedBoxType` for candidate metadata**

  Export this from `services/packaging-generator.ts` immediately after `boxTypes`:

  ```ts
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
  ```

  Import `aiGeneratedPackagingBoxTypeId` from `@/types/packaging` in this file.

- [ ] **Step 3: Migrate persisted projects without destroying historic candidates**

  In `migratePackagingProject`, replace the version-2 prompt migration with this returned shape:

  ```ts
  return {
    ...emptyPackagingProject(),
    ...input,
    promptVersion: 3,
    selectedBoxTypeId: aiGeneratedPackagingBoxTypeId,
    uploadedBoxType: undefined,
    structureConfirmed: undefined,
    candidates: input.candidates || [],
    favoriteIds: input.favoriteIds || [],
    promptOptions: [],
    generationPrompt: "",
    generationCount: Math.max(1, Math.min(5, input.generationCount || 3)),
  };
  ```

  Import `aiGeneratedPackagingBoxTypeId` from `@/types/packaging` into the provider. This keeps old candidate and final-image records readable, while preventing legacy uploaded-box state from driving new generations.

- [ ] **Step 4: Let all packaging candidates finalize without a structure-review gate**

  Import `aiGeneratedBoxType` beside `boxTypes`, then replace the lookup and review guard in `finalizePackaging` with:

  ```ts
  const boxType = candidate?.boxTypeId === aiGeneratedBoxType.id
    ? aiGeneratedBoxType
    : old.packagingProject.uploadedBoxType?.id === candidate?.boxTypeId
      ? old.packagingProject.uploadedBoxType
      : boxTypes.find((item) => item.id === candidate?.boxTypeId) || aiGeneratedBoxType;
  if (!candidate) return old;
  ```

  Remove the following `candidate.subjectReviewStatus === "completed"` condition entirely. Keep the existing `finalDesign`, completion, and delivery invalidation behavior unchanged.

- [ ] **Step 5: Re-run the focused test and commit the data-contract change**

  Run: `node --test tests/rendered-html.test.mjs`

  Expected: the test continues to fail only on the unmodified page and generator assertions.

  ```bash
  git add types/packaging.ts services/packaging-generator.ts components/design-brief-provider.tsx
  git commit -m "feat: add AI-generated packaging state"
  ```

### Task 3: Generate packaging directly from Logo and product-image references

**Files:**
- Modify: `services/packaging-generator.ts:70-127`

- [ ] **Step 1: Make historic face metadata work when no copy package is supplied**

  Change the helper to safely read optional copy data:

  ```ts
  const field = (params: PackagingGenParams, key: string, fallback: string) =>
    params.finalCopy?.fields.find((item) => item.key === key)?.content || fallback;
  ```

- [ ] **Step 2: Replace the structure-reference prompt with the fixed Logo/product-reference prompt**

  In `directPreviewPrompt`, remove `box`, `analysis`, `structureSummary`, and `views`. The returned prompt must contain these rules verbatim:

  ```ts
  真实参考图顺序：第 1 张是定稿 Logo 强参考，必须保持图形、字形、比例、留白和组合关系；第 2 张是定稿产品图。产品图仅用于提取配色、材质、表面工艺、光线与品牌氛围，严禁复制其产品本体、器型、封口、功能结构或将其误画为外包装。
  唯一主设计对象是外包装。根据用户要求、产品品类和合理装配空间自行规划可生产的外包装结构、轮廓、开合方式与材质；每张候选可探索不同结构，不受旧盒型限制。
  输出一张 9:16 高质量外包装概念效果预览：上方约 60% 是一张连续完整的商业场景，完整外包装必须占据视觉中心；产品本体最多是小比例辅助道具。下方约 40% 是干净背景上的同一外包装正面、侧面和背面展示，严禁任何产品本体进入下方结构区。
  ```

  Keep the existing ban on dielines, CAD, UI, watermarks, and non-horizontal layout. Include the user text from `params.designPrompt` before these constraints and keep `第 ${index + 1} 个效果方案` as a candidate-variation cue.

- [ ] **Step 3: Send only the two fixed references to the image job**

  Replace the reference block in `AiPackagingGenerator.generate` with:

  ```ts
  if (!params.finalProductDesign.imageUrl) throw new Error("缺少定稿产品图参考");
  const box = aiGeneratedBoxType;
  const references = [params.finalLogo.imageUrl, params.finalProductDesign.imageUrl];
  const urls = await callAi<(string | undefined)[]>("packaging", "image", {
    prompts,
    referenceImageGroups: prompts.map(() => references),
    size: "1024x1536",
    quality: "high",
  });
  ```

  Continue creating candidates with `boxTypeId: aiGeneratedBoxType.id`, the product CMF palette, `renderMode: "direct_ai_preview"`, and the fully expanded generation prompt. Set a default `directionName` to `外包装方案 ${index + 1}` when the caller provides none.

- [ ] **Step 4: Run the focused test and commit the image-generation change**

  Run: `node --test tests/rendered-html.test.mjs`

  Expected: generator reference-order and product-reference assertions pass; page assertions still fail.

  ```bash
  git add services/packaging-generator.ts
  git commit -m "feat: generate packaging from logo and product references"
  ```

### Task 4: Replace the Step 5 UI and direct generation action

**Files:**
- Modify: `components/packaging-design-page.tsx:1-433`

- [ ] **Step 1: Remove legacy dependencies and derived state**

  Remove these imports: `useEffect`, `useRef`, `ChangeEvent`, `boxTypes`, `packagingDesignPromptGenerator`, `packagingStructureAnalyzer`, `packagingQualityReviewer`, `BoxType`, and `PackagingReferenceAnalysis`. Keep `useMemo`, `useState`, `packagingGenerator`, `packagingSwatch`, `PackagingCandidate`, and `useDesignBrief`.

  Remove `copyProject`, `finalCopy`, `selectedBox`, `mainSlogan`, `analyzedReferenceId`, and all functions from `analyzeStructure` through `regenerateCorrectSubject`. Compute candidates from all stored candidates, rather than filtering them by `selectedBoxTypeId`:

  ```ts
  const candidates = useMemo(() => [...packagingProject.candidates].sort(
    (a, b) => Number(packagingProject.favoriteIds.includes(b.id)) - Number(packagingProject.favoriteIds.includes(a.id))
      || (Date.parse(b.createdAt || "") || b.round) - (Date.parse(a.createdAt || "") || a.round),
  ), [packagingProject.candidates, packagingProject.favoriteIds]);
  ```

- [ ] **Step 2: Implement one direct multi-candidate generation action**

  Use this generation guard and request:

  ```ts
  const generate = async () => {
    if (!finalLogo || !finalProduct || generating) return;
    const requirement = packagingProject.designRequirement.trim();
    if (!requirement) {
      setNotice("请先输入外包装设计要求。");
      return;
    }
    setGenerating(true);
    setNotice("");
    const nextRound = packagingProject.generationRound + 1;
    try {
      const items = await packagingGenerator.generate({
        brief,
        finalLogo: { imageUrl: finalLogo.imageUrl, styleTags: finalLogo.styleTags },
        finalProductDesign: { imageUrl: finalProduct.imageUrl, cmf: finalProduct.cmf },
        designPrompt: requirement,
        count: packagingProject.generationCount,
      });
      updatePackagingProject((current) => ({
        ...current,
        generationRound: nextRound,
        candidates: [...items.map((item) => ({ ...item, round: nextRound })), ...current.candidates],
      }));
      setNotice(`已生成 ${items.length} 张外包装效果图。`);
    } catch (error) {
      setNotice(`生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGenerating(false);
    }
  };
  ```

  Change the prerequisite to `!completedSteps.includes(4) || !finalLogo || !finalProduct` and update its copy to mention only Logo and product-image references.

- [ ] **Step 3: Replace Sections 01–03 with fixed references and a user prompt**

  Keep the design-basis summary, replacing the fourth cell with `AI 自主规划外包装结构`. Delete the upload and prompt-option sections. Add one section headed `02 用户外包装设计要求`, containing:

  ```tsx
  <div className="packaging-fixed-references">
    <strong>固定图片参考</strong>
    <div>
      <figure><img src={finalLogo.imageUrl} alt="定稿 Logo" /><figcaption>定稿 Logo · 必用</figcaption></figure>
      <figure><img src={finalProduct.imageUrl} alt="定稿产品图" /><figcaption>定稿产品图 · 必用</figcaption></figure>
    </div>
    <p>Logo 必须保持一致；产品图只用于协调包装的颜色、材质与氛围，不会复制产品本体结构。</p>
  </div>
  <div className="packaging-requirement-row">
    <label><strong>用户外包装设计要求</strong><small>必填，直接用于生成最终外包装效果图</small><textarea value={packagingProject.designRequirement} onChange={(event) => updatePackagingProject((current) => ({ ...current, designRequirement: event.target.value }))} placeholder="例如：做成哑光硬纸盒，延续产品的雾绿与米白，带有自然疗愈氛围和克制的烫金细节。" /></label>
    <div className="prompt-count-picker"><strong>生成方案数</strong><span>一次生成 1–5 张</span><div>{[1,2,3,4,5].map((count) => <button type="button" className={packagingProject.generationCount === count ? "active" : ""} key={count} onClick={() => updatePackagingProject((current) => ({ ...current, generationCount: count }))}>{count}</button>)}</div></div>
  </div>
  <div className="packaging-prompt-actions"><button className="primary-button" disabled={generating || !packagingProject.designRequirement.trim()} onClick={() => void generate()}>{generating ? "正在生成外包装效果图…" : `生成 ${packagingProject.generationCount} 张外包装方案`}</button></div>
  ```

  Renumber the preview and final-selection sections from 04/05 to 03/04. Replace the empty-state copy with `输入外包装设计要求后即可生成多方案。` Remove all subject-review notices, disabled states, and retry buttons from candidate and final-selection cards. In the preview modal, replace `boxFor(preview.boxTypeId)?.name` with `AI 自由设计外包装`.

- [ ] **Step 4: Run all project tests and inspect the diff**

  Run: `node --test tests/rendered-html.test.mjs tests/image-job-manager.test.mjs && git diff --check`

  Expected: all rendered HTML and image-job manager tests pass, and `git diff --check` prints no whitespace errors.

- [ ] **Step 5: Commit the UI change**

  ```bash
  git add components/packaging-design-page.tsx tests/rendered-html.test.mjs
  git commit -m "feat: simplify packaging design to fixed asset references"
  ```

### Task 5: Verify production compilation boundary

**Files:**
- Verify only: `package.json`

- [ ] **Step 1: Run the configured test command**

  Run: `npm test`

  Expected: `vinext build` succeeds, followed by the rendered HTML test suite.

- [ ] **Step 2: If the known local dependency blocker recurs, record it without modifying dependencies**

  The current workspace may fail before compilation because `node_modules/.bin/vinext` lacks execute permission or `@rolldown/binding-darwin-arm64` is missing. In that case, do not delete or reinstall `node_modules`; report the exact error and retain the passing Node test evidence from Task 4.

- [ ] **Step 3: Confirm the working tree scope**

  Run: `git status --short`

  Expected: only intended Step 5 files and pre-existing logo streaming changes are present; do not stage unrelated changes.
