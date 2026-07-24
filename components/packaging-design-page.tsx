"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { boxTypes, packagingGenerator, packagingSwatch } from "@/services/packaging-generator";
import { packagingDesignPromptGenerator } from "@/services/packaging-design-prompt-generator";
import { packagingStructureAnalyzer } from "@/services/packaging-structure-analyzer";
import { packagingQualityReviewer } from "@/services/packaging-quality-reviewer";
import type { BoxType, PackagingCandidate, PackagingReferenceAnalysis } from "@/types/packaging";
import { useDesignBrief } from "./design-brief-provider";

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("参考图读取失败"));
  reader.readAsDataURL(file);
});

const hasBlockingPackagingReview = (candidate: PackagingCandidate) => (
  candidate.subjectReviewStatus === "completed"
  && Boolean(candidate.subjectReview)
  && (
    !candidate.subjectReview?.outerPackageCorrect
    || !candidate.subjectReview?.structureViewsPure
    || (candidate.subjectReview?.structureSimilarity ?? 0) < 60
    || (candidate.subjectReview?.productDominance ?? 100) > 45
  )
);
export function PackagingDesignPage() {
  const router = useRouter();
  const {
    brief, hydrated, completedSteps, logoProject, copyProject, productDesign,
    packagingProject, updatePackagingProject, finalizePackaging, reopenPackaging,
  } = useDesignBrief();
  const [generating, setGenerating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [analyzingStructure, setAnalyzingStructure] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PackagingCandidate | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const analyzedReferenceId = useRef<string | undefined>(undefined);

  const finalLogo = logoProject.candidates.find((item) => item.id === logoProject.finalLogoId);
  const finalCopy = copyProject.finalPackage;
  const finalProduct = productDesign.candidates.find((item) => item.id === productDesign.finalDesignId);
  const selectedBox = packagingProject.uploadedBoxType?.id === packagingProject.selectedBoxTypeId
    ? packagingProject.uploadedBoxType
    : boxTypes.find((item) => item.id === packagingProject.selectedBoxTypeId);
  const mainSlogan = finalCopy?.fields.find((item) => item.key === "main_slogan")?.content || "";
  const favorites = packagingProject.favoriteIds.flatMap((id) => {
    const item = packagingProject.candidates.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const numberOf = (id: string) => packagingProject.candidates.findIndex((item) => item.id === id) + 1;
  const candidates = useMemo(
    () => packagingProject.candidates
      .filter((item) => item.boxTypeId === packagingProject.selectedBoxTypeId)
      .sort((a, b) => Number(packagingProject.favoriteIds.includes(b.id)) - Number(packagingProject.favoriteIds.includes(a.id))
        || (Date.parse(b.createdAt || "") || b.round) - (Date.parse(a.createdAt || "") || a.round)),
    [packagingProject],
  );
  const boxFor = (id: string) => packagingProject.uploadedBoxType?.id === id
    ? packagingProject.uploadedBoxType
    : boxTypes.find((item) => item.id === id);

  const analyzeStructure = async (box: BoxType) => {
    const imageUrl = box.referenceImageUrl || box.structureImageUrl;
    if (!imageUrl || analyzingStructure) return;
    setAnalyzingStructure(true);
    setNotice("AI 正在识别外包装结构、轮廓比例和开合方式…");
    try {
      const referenceAnalysis = await packagingStructureAnalyzer.analyze(brief, box);
      analyzedReferenceId.current = box.id;
      updatePackagingProject((current) => current.uploadedBoxType?.id === box.id ? ({
        ...current,
        uploadedBoxType: {
          ...current.uploadedBoxType,
          name: referenceAnalysis.structureName,
          description: referenceAnalysis.structureSummary,
          referenceAnalysis,
        },
        structureConfirmed: false,
        promptOptions: [],
        generationPrompt: "",
      }) : current);
      setNotice("结构识别完成。请核对结构类型、轮廓比例和开合方式后确认。");
    } catch (error) {
      setNotice(`结构识别失败：${error instanceof Error ? error.message : "服务返回未知错误"}。可重试后再确认。`);
    } finally {
      setAnalyzingStructure(false);
    }
  };

  const uploadBoxReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setNotice("上传失败：参考图不能超过 8MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type)) {
      setNotice("上传失败：仅支持 JPG、PNG、WEBP 或 SVG");
      return;
    }
    try {
      const imageUrl = await readImage(file);
      const uploaded: BoxType = {
        id: `uploaded-box-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, "") || "上传外包装",
        structureImageUrl: imageUrl,
        referenceImageUrl: imageUrl,
        dielineImageUrl: imageUrl,
        suitableCategories: [brief.product.category],
        referenceDimensions: [0, 0, 0],
        referenceDimensionsLabel: "AI 根据参考图、产品定稿图与合理装配空间自动推断",
        costLevel: 2,
        costLabel: "待评估",
        description: "以用户上传的外包装参考图为结构依据，保持轮廓、开合方式与主要比例",
        source: "upload",
      };
      updatePackagingProject((current) => ({
        ...current,
        uploadedBoxType: uploaded,
        selectedBoxTypeId: uploaded.id,
        structureConfirmed: false,
        promptOptions: [],
        generationPrompt: "",
      }));
      analyzedReferenceId.current = uploaded.id;
      void analyzeStructure(uploaded);
    } catch (error) {
      setNotice(`上传失败：${error instanceof Error ? error.message : "图片读取失败"}`);
    }
  };

  const editReferenceAnalysis = (patch: Partial<PackagingReferenceAnalysis>) => updatePackagingProject((current) => {
    if (!current.uploadedBoxType?.referenceAnalysis) return current;
    const referenceAnalysis = { ...current.uploadedBoxType.referenceAnalysis, ...patch };
    return {
      ...current,
      uploadedBoxType: {
        ...current.uploadedBoxType,
        name: referenceAnalysis.structureName,
        description: referenceAnalysis.structureSummary,
        referenceAnalysis,
      },
      structureConfirmed: false,
      promptOptions: [],
      generationPrompt: "",
    };
  });

  useEffect(() => {
    const box = packagingProject.uploadedBoxType;
    if (!hydrated || !box?.referenceImageUrl || box.referenceAnalysis || analyzingStructure || analyzedReferenceId.current === box.id) return;
    analyzedReferenceId.current = box.id;
    void analyzeStructure(box);
  }, [hydrated, packagingProject.uploadedBoxType?.id, packagingProject.uploadedBoxType?.referenceAnalysis, analyzingStructure]);

  const generatePrompt = async () => {
    if (!selectedBox || selectedBox.source !== "upload" || !finalLogo || !finalProduct || generatingPrompt) return;
    if (!selectedBox.referenceAnalysis) {
      setNotice("尚未完成外包装结构识别，正在先识别结构。");
      await analyzeStructure(selectedBox);
      return;
    }
    setGeneratingPrompt(true);
    setNotice("");
    try {
      const promptOptions = await packagingDesignPromptGenerator.generate({
        brief,
        boxType: selectedBox,
        productCmf: finalProduct.cmf,
        logoImageUrl: finalLogo.imageUrl,
        mainSlogan,
        requirement: packagingProject.designRequirement,
        count: packagingProject.promptDirectionCount,
      });
      updatePackagingProject((current) => ({
        ...current,
        promptOptions,
        generationPrompt: promptOptions[0]?.promptZh || "",
      }));
      setNotice(`已生成 ${promptOptions.length} 条包装效果提示词，请修改并勾选后生图。`);
    } catch (error) {
      setNotice(`提示词生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const editPromptOption = (id: string, patch: Partial<(typeof packagingProject.promptOptions)[number]>) => {
    updatePackagingProject((current) => ({
      ...current,
      promptOptions: current.promptOptions.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const reviewCandidate = async (candidate: PackagingCandidate, box: BoxType) => {
    const structureImageUrl = box.referenceImageUrl || box.structureImageUrl;
    if (!box.referenceAnalysis || !structureImageUrl) return;
    try {
      const subjectReview = await packagingQualityReviewer.review(candidate, structureImageUrl, box.referenceAnalysis);
      updatePackagingProject((current) => ({
        ...current,
        candidates: current.candidates.map((item) => item.id === candidate.id
          ? { ...item, subjectReviewStatus: "completed", subjectReview }
          : item),
      }));
    } catch {
      updatePackagingProject((current) => ({
        ...current,
        candidates: current.candidates.map((item) => item.id === candidate.id
          ? { ...item, subjectReviewStatus: "failed" }
          : item),
      }));
    }
  };

  const generate = async () => {
    if (!selectedBox || !finalLogo || !finalCopy || !finalProduct || generating) return;
    const selectedPrompts = packagingProject.promptOptions.filter((item) => item.selected && item.promptZh.trim());
    if (!selectedPrompts.length || !selectedPrompts.every((item) => item.promptZh.trim())) {
      setNotice("请至少勾选一条完整的包装效果提示词。");
      return;
    }
    setGenerating(true);
    setNotice("");
    const nextRound = packagingProject.generationRound + 1;
    try {
      const results = await Promise.allSettled(selectedPrompts.map(async (promptOption) => {
        const items = await packagingGenerator.generate({
          brief,
          finalLogo: { imageUrl: finalLogo.imageUrl, styleTags: finalLogo.styleTags },
          finalCopy,
          finalProductDesign: { cmf: finalProduct.cmf },
          boxTypeId: selectedBox.id,
          boxType: selectedBox,
          designPrompt: promptOption.promptZh,
          directionName: promptOption.directionName,
          count: 1,
        });
        updatePackagingProject((current) => ({
          ...current,
          generationRound: nextRound,
          candidates: [...items.map((item) => ({ ...item, round: nextRound })), ...current.candidates],
        }));
        items.forEach((item) => void reviewCandidate({ ...item, round: nextRound }, selectedBox));
        return items.length;
      }));
      const completed = results.reduce((total, result) => total + (result.status === "fulfilled" ? result.value : 0), 0);
      const failures = results.filter((result) => result.status === "rejected");
      if (!completed && failures[0]?.status === "rejected") throw failures[0].reason;
      setNotice(failures.length
          ? `已生成 ${completed} 张效果图，${failures.length} 个方向失败：${failures[0]?.status === "rejected" && failures[0].reason instanceof Error ? failures[0].reason.message : "服务返回错误"}`
          : `已按 ${completed} 条提示词生成 ${completed} 张外包装效果预览`);
    } catch (error) {
      setNotice(`生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGenerating(false);
    }
  };

  const toggleFavorite = (candidate: PackagingCandidate) => {
    const exists = packagingProject.favoriteIds.includes(candidate.id);
    if (!exists && packagingProject.favoriteIds.length >= 5) {
      setNotice("最多收藏 5 套方案，请先取消一套。");
      return;
    }
    updatePackagingProject((current) => ({
      ...current,
      favoriteIds: exists
        ? current.favoriteIds.filter((id) => id !== candidate.id)
        : [...current.favoriteIds, candidate.id],
    }));
  };

  const deleteCandidate = (candidate: PackagingCandidate) => {
    if (!window.confirm(`删除方案 #${numberOf(candidate.id)}？此操作不会删除其他历史方案。`)) return;
    updatePackagingProject((current) => ({
      ...current,
      candidates: current.candidates.filter((item) => item.id !== candidate.id),
      favoriteIds: current.favoriteIds.filter((id) => id !== candidate.id),
      finalDesign: current.finalDesign?.candidate.id === candidate.id ? undefined : current.finalDesign,
    }));
  };

  const regenerateCorrectSubject = async (candidate: PackagingCandidate) => {
    if (!selectedBox || !finalLogo || !finalCopy || !finalProduct || generating) return;
    setGenerating(true);
    setNotice("正在按已确认外包装结构重新生成…");
    try {
      const retryHint = candidate.subjectReview?.retryHint || "外包装作为唯一主对象，产品只可作为小比例场景道具，下方仅展示外包装结构视图。";
      const [replacement] = await packagingGenerator.generate({
        brief,
        finalLogo: { imageUrl: finalLogo.imageUrl, styleTags: finalLogo.styleTags },
        finalCopy,
        finalProductDesign: { cmf: finalProduct.cmf },
        boxTypeId: selectedBox.id,
        boxType: selectedBox,
        designPrompt: `${candidate.generationPrompt || ""}\n\n纠正要求：${retryHint}`,
        directionName: `${candidate.directionName || "外包装方案"} · 正确主体重生`,
        count: 1,
      });
      if (!replacement) throw new Error("图像服务未返回重生结果");
      const nextRound = packagingProject.generationRound + 1;
      const nextCandidate = { ...replacement, round: nextRound };
      updatePackagingProject((current) => ({
        ...current,
        generationRound: nextRound,
        candidates: [nextCandidate, ...current.candidates],
      }));
      void reviewCandidate(nextCandidate, selectedBox);
      setNotice("已生成新的外包装主体方案，原方案仍保留。");
    } catch (error) {
      setNotice(`重生失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!hydrated) return <div className="form-loading"><span /><p>正在载入包装设计项目…</p></div>;
  if (!completedSteps.includes(4) || !finalLogo || !finalCopy || !finalProduct) {
    return <div className="placeholder-page"><span className="eyebrow">STEP 5 / 6</span><h1>请先完成产品图设计</h1><p>外包装设计需要读取定稿 Logo、文案包与产品设计方案。</p><button className="primary-button" onClick={() => router.push("/workflow/4")}>返回第 4 步</button></div>;
  }

  const structureReady = Boolean(
    selectedBox?.source === "upload"
    && selectedBox.referenceAnalysis
    && packagingProject.structureConfirmed,
  );

  return <>
    <div className="page-heading packaging-heading">
      <div><span className="eyebrow">STEP 5 / 6</span><h1>外包装设计</h1><p>上传外包装参考，先确认可编辑提示词，再生成制作完成后的商业效果预览。</p></div>
      <span className="mock-badge">AI PACKAGING PREVIEW</span>
    </div>

    <section className="pack-basis-card">
      <div className="logo-section-head"><div><span>01</span><div><h2>设计依据</h2><p>Logo、产品 CMF 与品牌信息作为外包装视觉依据</p></div></div></div>
      <div className="pack-basis-grid">
        <div className="basis-logo"><img src={finalLogo.imageUrl} alt="定稿 Logo" /><div><small>定稿 Logo · 必用</small><strong>{finalLogo.styleTags.join(" · ")}</strong></div></div>
        <div><small>产品与品牌</small><strong>{brief.brand.name}</strong><blockquote>{brief.product.name}</blockquote></div>
        <div><small>产品配色与器形</small><div className="pack-palette">{finalProduct.cmf.colorScheme.map((color) => <span key={color}><i style={{ background: packagingSwatch(color) }} />{color}</span>)}</div><strong>{finalProduct.containerType.volume} {finalProduct.containerType.name}</strong></div>
        <div><small>外包装参考</small><strong>{selectedBox?.name || "尚未上传"}</strong></div>
      </div>
    </section>

    <section className="box-selector">
      <div className="logo-section-title"><div><span>02</span><div><h2>上传外包装参考图</h2><p>AI 保持参考包装的轮廓、比例和开合结构，不再选择内置盒型</p></div></div></div>
      <div className="reference-structure-panel">
        <label className="reference-upload-button">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => void uploadBoxReference(event)} />
          <span>＋</span><div><strong>{packagingProject.uploadedBoxType ? "重新上传外包装参考图" : "上传外包装参考图"}</strong><small>JPG / PNG / WEBP / SVG，最大 8MB</small></div>
        </label>
        {packagingProject.uploadedBoxType ? <div className="reference-structure-editor">
          <img src={packagingProject.uploadedBoxType.referenceImageUrl || packagingProject.uploadedBoxType.structureImageUrl} alt="已上传的外包装参考图" />
          <div className="reference-fields">
            {analyzingStructure ? <div className="packaging-structure-analyzing">AI 正在识别外包装结构…</div> : packagingProject.uploadedBoxType.referenceAnalysis ? <>
              <label>结构名称<input value={packagingProject.uploadedBoxType.referenceAnalysis.structureName} onChange={(event) => editReferenceAnalysis({ structureName: event.target.value })} /></label>
              <label>结构类型<select value={packagingProject.uploadedBoxType.referenceAnalysis.structureKind} onChange={(event) => editReferenceAnalysis({ structureKind: event.target.value as PackagingReferenceAnalysis["structureKind"] })}><option value="folding_carton">折叠纸盒</option><option value="rigid_box">硬质礼盒</option><option value="drawer_box">抽屉盒</option><option value="tube">筒形外包装</option><option value="pouch">袋形外包装</option><option value="tray">托盘式包装</option><option value="custom">自定义结构</option></select></label>
              <label>轮廓比例<input value={packagingProject.uploadedBoxType.referenceAnalysis.outlineRatio} onChange={(event) => editReferenceAnalysis({ outlineRatio: event.target.value })} /></label>
              <label>开合方式<input value={packagingProject.uploadedBoxType.referenceAnalysis.openingMethod} onChange={(event) => editReferenceAnalysis({ openingMethod: event.target.value })} /></label>
              <label>结构视图<select value={packagingProject.uploadedBoxType.referenceAnalysis.viewMode} onChange={(event) => editReferenceAnalysis({ viewMode: event.target.value as PackagingReferenceAnalysis["viewMode"] })}><option value="three_view">正面＋侧面＋背面</option><option value="two_view">正面＋背面</option></select></label>
              <div className="ai-dimension-field"><span>规格 / 尺寸</span><strong>AI 自动推断</strong><small>只参考外包装结构图与合理装配空间，不使用产品图作为图片约束</small></div>
              <label className="wide">结构说明<textarea value={packagingProject.uploadedBoxType.referenceAnalysis.structureSummary} onChange={(event) => editReferenceAnalysis({ structureSummary: event.target.value })} /></label>
            </> : <button className="secondary-button" type="button" onClick={() => void analyzeStructure(packagingProject.uploadedBoxType!)}>重新识别外包装结构</button>}
            <button className="confirm-reference-button" type="button" disabled={analyzingStructure || !packagingProject.uploadedBoxType.referenceAnalysis?.structureName.trim() || !packagingProject.uploadedBoxType.referenceAnalysis?.structureSummary.trim()} onClick={() => updatePackagingProject((current) => ({ ...current, selectedBoxTypeId: current.uploadedBoxType?.id, structureConfirmed: true, promptOptions: [], generationPrompt: "" }))}>确认结构并作为唯一主体</button>
          </div>
        </div> : <p className="reference-empty">请先上传外包装参考图。AI 将自动推断合适的外包装比例与概念尺寸。</p>}
      </div>
    </section>

    <section className="packaging-prompt-section">
      <div className="logo-section-title"><div><span>03</span><div><h2>生成并选择效果图提示词</h2><p>先生成 1–5 条可编辑方向，勾选满意的提示词后再生图</p></div></div></div>
      <div className="packaging-prompt-workbench">
        <div className="packaging-requirement-row">
          <label><strong>外包装设计要求</strong><small>选填，可自行修改</small><textarea placeholder="例如：希望盒体轻盈便携，延续产品配色，正面保持品牌识别，商业场景更有生活方式感。" value={packagingProject.designRequirement} onChange={(event) => updatePackagingProject((current) => ({ ...current, designRequirement: event.target.value, promptOptions: [], generationPrompt: "" }))} /></label>
          <div className="prompt-count-picker"><strong>生成几种提示词方案</strong><span>一次可生成 1–5 条</span><div>{[1, 2, 3, 4, 5].map((count) => <button type="button" className={packagingProject.promptDirectionCount === count ? "active" : ""} key={count} onClick={() => updatePackagingProject((current) => ({ ...current, promptDirectionCount: count, promptOptions: [], generationPrompt: "" }))}>{count}</button>)}</div></div>
        </div>
        <div className="packaging-fixed-references">
          <strong>固定图片参考</strong>
          <div>
            {selectedBox?.referenceImageUrl && <figure><img src={selectedBox.referenceImageUrl} alt="外包装结构参考" /><figcaption>外包装结构 · 必用</figcaption></figure>}
            <figure><img src={finalLogo.imageUrl} alt="定稿 Logo" /><figcaption>定稿 Logo · 必用</figcaption></figure>
          </div>
          <p>生图图片输入只有“外包装结构＋定稿 Logo”。产品 CMF 只以文字协调配色、材质和工艺，不会把产品图传给模型。</p>
          <div className="packaging-cmf-summary"><strong>产品 CMF 文字摘要</strong><span>{finalProduct.cmf.colorScheme.join("、")}</span><span>{finalProduct.cmf.material}</span><span>{finalProduct.cmf.finish}</span></div>
        </div>
        <button className="generate-prompts-button" type="button" disabled={!structureReady || generatingPrompt} onClick={() => void generatePrompt()}>{generatingPrompt ? "AI 正在分析参考图…" : `AI 生成 ${packagingProject.promptDirectionCount} 条包装效果提示词`}</button>
        {packagingProject.promptOptions.length ? <div className="packaging-prompt-list">
          <div className="packaging-prompt-list-head"><span>已选择 {packagingProject.promptOptions.filter((item) => item.selected).length}/{packagingProject.promptOptions.length} 条</span><div><button type="button" onClick={() => updatePackagingProject((current) => ({ ...current, promptOptions: current.promptOptions.map((item) => ({ ...item, selected: true })) }))}>全选</button><button type="button" onClick={() => updatePackagingProject((current) => ({ ...current, promptOptions: current.promptOptions.map((item) => ({ ...item, selected: false })) }))}>清空</button></div></div>
          {packagingProject.promptOptions.map((item, index) => <article className={`packaging-prompt-option ${item.selected ? "selected" : ""}`} key={item.id}>
            <div className="packaging-prompt-option-head"><label><input type="checkbox" checked={item.selected} onChange={(event) => editPromptOption(item.id, { selected: event.target.checked })} /><span>用于生图</span></label><strong>方向 {index + 1}</strong></div>
            <div className="packaging-prompt-option-meta"><label>方向名称<input value={item.directionName} onChange={(event) => editPromptOption(item.id, { directionName: event.target.value })} /></label><label>设计概述<input value={item.designSummary} onChange={(event) => editPromptOption(item.id, { designSummary: event.target.value })} /></label></div>
            <label className="packaging-generated-prompt"><strong>中文生图提示词</strong><small>可直接修改，勾选后用于生成一张效果图</small><textarea value={item.promptZh} onChange={(event) => editPromptOption(item.id, { promptZh: event.target.value })} /></label>
          </article>)}
        </div> : <div className="packaging-prompt-empty">上传并确认外包装参考后，先生成 1–5 条可编辑提示词。</div>}
        <div className="packaging-prompt-actions">
          <button className="primary-button" disabled={generating || !structureReady || !packagingProject.promptOptions.some((item) => item.selected && item.promptZh.trim())} onClick={() => void generate()}>{generating ? "正在生成包装效果图…" : `确认提示词并生成 ${packagingProject.promptOptions.filter((item) => item.selected && item.promptZh.trim()).length} 张效果图`}</button>
        </div>
      </div>
    </section>

    <section className="pack-solutions">
      <div className="logo-section-title"><div><span>04</span><div><h2>外包装效果预览</h2><p>{candidates.length ? `${candidates.length} 套方案 · ${packagingProject.generationRound} 轮生成` : "确认提示词后生成商业效果预览"}</p></div></div>{notice && <span className="generation-notice">{notice}</span>}</div>
      {generating && !candidates.length ? <div className="pack-loading">正在生成制作完成后的外包装效果图…</div> : candidates.length ? <div className="pack-grid">
        {candidates.map((candidate) => {
          const favorite = packagingProject.favoriteIds.includes(candidate.id);
          const subjectFailed = hasBlockingPackagingReview(candidate);
          return <article className={`pack-card ${favorite ? "favorite" : ""}`} key={candidate.id}>
            <div className="pack-preview"><img src={candidate.previewImageUrl} alt="外包装效果方案" /></div>
            <div className="pack-card-body"><div className="pack-card-head"><strong>{candidate.directionName || "外包装设计方案"}</strong></div>
              {candidate.subjectReviewStatus === "pending" && <div className="packaging-subject-pending">正在检查外包装主体…</div>}
              {candidate.subjectReviewStatus === "failed" && <div className="packaging-subject-review-note">主体检查服务暂不可用，不阻止继续评审</div>}
              {subjectFailed && <div className="packaging-subject-failed"><strong>外包装主体识别失败</strong><ul>{candidate.subjectReview?.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><button type="button" onClick={() => void regenerateCorrectSubject(candidate)}>按正确主体重新生成</button></div>}
              <div className="pack-card-actions pack-preview-actions"><button onClick={() => { setPreviewZoom(1); setPreview(candidate); }}>查看大图</button><button disabled={subjectFailed} className={favorite ? "selected-action" : ""} onClick={() => toggleFavorite(candidate)}>{favorite ? "取消已选" : "加入已选"}</button><button className="danger-link" onClick={() => deleteCandidate(candidate)}>删除</button></div></div>
          </article>;
        })}
      </div> : <div className="product-empty"><span>▦</span><p>尚未生成外包装效果图</p><small>请先确认外包装参考并生成可编辑提示词。</small></div>}
    </section>

    <section className="pack-final-section">
      <div className="logo-section-title"><div><span>05</span><div><h2>已选方案与定稿</h2><p>从效果预览中收藏候选，最终确定一套外包装概念方案</p></div></div><b>{favorites.length}/5</b></div>
      {packagingProject.finalDesign ? <div className="final-pack"><img src={packagingProject.finalDesign.candidate.previewImageUrl} alt="定稿外包装效果" /><div><span className="eyebrow">FINAL PACKAGING PREVIEW</span><h3>{packagingProject.finalDesign.candidate.directionName || packagingProject.finalDesign.boxType.name}</h3><small>已保存外包装参考、效果预览和生成提示词</small></div><div className="final-actions"><button className="secondary-button" onClick={() => { if (window.confirm("重新选择将撤销当前包装定稿。确认继续吗？")) reopenPackaging(); }}>重新选择</button><button className="primary-button" onClick={() => router.push("/workflow/6")}>进入质检与交付 →</button></div></div> : favorites.length ? <div className="pack-selected-grid">{favorites.map((candidate) => {
        const subjectFailed = hasBlockingPackagingReview(candidate);
        return <article key={candidate.id}><img src={candidate.previewImageUrl} alt="已选外包装效果" /><div><strong>{candidate.directionName || "外包装设计方案"}</strong>{subjectFailed && <small>外包装主体识别失败，不能定稿</small>}</div><button disabled={subjectFailed} className="finalize-button" onClick={() => finalizePackaging(candidate.id)}>{subjectFailed ? "需重新生成" : "定稿"}</button></article>;
      })}</div> : <div className="empty-selected"><p>还没有选择外包装方案</p><small>在效果图下方点击“加入已选”。</small></div>}
    </section>

    {preview && <div className="modal-backdrop preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="pack-effect-preview-modal product-preview-modal final-board" role="dialog" aria-modal="true" aria-label={`外包装方案 ${numberOf(preview.id)} 大图`}><button type="button" onClick={() => setPreview(null)} aria-label="关闭">×</button><div className="preview-zoom-toolbar"><span>滚动鼠标滚轮查看细节</span><button type="button" onClick={() => setPreviewZoom((value) => Math.max(.5, value - .25))}>−</button><b>{Math.round(previewZoom * 100)}%</b><button type="button" onClick={() => setPreviewZoom((value) => Math.min(4, value + .25))}>＋</button><button type="button" onClick={() => setPreviewZoom(1)}>重置</button></div><div className="preview-zoom-stage" onWheel={(event) => { event.preventDefault(); setPreviewZoom((value) => Math.min(4, Math.max(.5, value + (event.deltaY < 0 ? .15 : -.15)))); }}><img style={{ width: `${previewZoom * 100}%` }} src={preview.previewImageUrl} alt={`外包装方案 #${numberOf(preview.id)} 效果大图`} /></div><div className="pack-effect-meta"><strong>方案 #{numberOf(preview.id)} · {preview.directionName || boxFor(preview.boxTypeId)?.name || "上传外包装"}</strong><span>{preview.palette.join(" / ")}</span><small>概念效果图，不含刀版与印刷工程文件</small></div></section></div>}
  </>;
}
