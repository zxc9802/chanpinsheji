"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { packagingGenerator, packagingSwatch } from "@/services/packaging-generator";
import type { PackagingCandidate } from "@/types/packaging";
import { useDesignBrief } from "./design-brief-provider";

export function PackagingDesignPage() {
  const router = useRouter();
  const {
    brief, hydrated, completedSteps, logoProject, productDesign,
    packagingProject, updatePackagingProject, finalizePackaging, reopenPackaging,
  } = useDesignBrief();
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PackagingCandidate | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  const finalLogo = logoProject.candidates.find((item) => item.id === logoProject.finalLogoId);
  const finalProduct = productDesign.candidates.find((item) => item.id === productDesign.finalDesignId);
  const favorites = packagingProject.favoriteIds.flatMap((id) => {
    const item = packagingProject.candidates.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const numberOf = (id: string) => packagingProject.candidates.findIndex((item) => item.id === id) + 1;
  const candidates = useMemo(() => [...packagingProject.candidates].sort(
    (a, b) => Number(packagingProject.favoriteIds.includes(b.id)) - Number(packagingProject.favoriteIds.includes(a.id))
      || (Date.parse(b.createdAt || "") || b.round) - (Date.parse(a.createdAt || "") || a.round),
  ), [packagingProject.candidates, packagingProject.favoriteIds]);

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
        finalProductDesign:{ imageUrl: finalProduct.imageUrl, cmf: finalProduct.cmf },
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

  if (!hydrated) return <div className="form-loading"><span /><p>正在载入包装设计项目…</p></div>;
  if (!completedSteps.includes(4) || !finalLogo || !finalProduct) {
    return <div className="placeholder-page"><span className="eyebrow">STEP 5 / 6</span><h1>请先完成产品图设计</h1><p>外包装设计需要读取定稿 Logo 与定稿产品图。</p><button className="primary-button" onClick={() => router.push("/workflow/4")}>返回第 4 步</button></div>;
  }

  return <>
    <div className="page-heading packaging-heading">
      <div><span className="eyebrow">STEP 5 / 6</span><h1>外包装设计</h1><p>输入设计要求，AI 将结合定稿 Logo 与产品图生成多套可定稿的外包装效果图。</p></div>
      <span className="mock-badge">AI PACKAGING PREVIEW</span>
    </div>

    <section className="pack-basis-card">
      <div className="logo-section-head"><div><span>01</span><div><h2>设计依据</h2><p>Logo、产品图与品牌信息将共同约束外包装视觉</p></div></div></div>
      <div className="pack-basis-grid">
        <div className="basis-logo"><img src={finalLogo.imageUrl} alt="定稿 Logo" /><div><small>定稿 Logo · 必用</small><strong>{finalLogo.styleTags.join(" · ")}</strong></div></div>
        <div><small>产品与品牌</small><strong>{brief.brand.name}</strong><blockquote>{brief.product.name}</blockquote></div>
        <div><small>产品配色与器形</small><div className="pack-palette">{finalProduct.cmf.colorScheme.map((color) => <span key={color}><i style={{ background: packagingSwatch(color) }} />{color}</span>)}</div><strong>{finalProduct.containerType.volume} {finalProduct.containerType.name}</strong></div>
        <div><small>外包装结构</small><strong>AI 自主规划</strong><p>按产品与设计要求推导</p></div>
      </div>
    </section>

    <section className="packaging-prompt-section">
      <div className="logo-section-title"><div><span>02</span><div><h2>用户外包装设计要求</h2><p>直接描述你希望外包装呈现的风格、结构、材质、工艺或使用场景</p></div></div></div>
      <div className="packaging-prompt-workbench">
        <div className="packaging-fixed-references">
          <strong>固定图片参考</strong>
          <div>
            <figure><img src={finalLogo.imageUrl} alt="定稿 Logo" /><figcaption>定稿 Logo · 必用</figcaption></figure>
            <figure><img src={finalProduct.imageUrl} alt="定稿产品图" /><figcaption>定稿产品图 · 必用</figcaption></figure>
          </div>
          <p>Logo 必须保持一致；产品图只用于协调包装的颜色、材质与氛围，不会复制产品本体结构。</p>
          <div className="packaging-cmf-summary"><strong>产品 CMF 摘要</strong><span>{finalProduct.cmf.colorScheme.join("、")}</span><span>{finalProduct.cmf.material}</span><span>{finalProduct.cmf.finish}</span></div>
        </div>
        <div className="packaging-requirement-row">
          <label><strong>用户外包装设计要求</strong><small>必填，直接用于生成最终外包装效果图</small><textarea value={packagingProject.designRequirement} onChange={(event) => updatePackagingProject((current) => ({ ...current, designRequirement: event.target.value }))} placeholder="例如：做成哑光硬纸盒，延续产品的雾绿与米白，带有自然疗愈氛围和克制的烫金细节。" /></label>
          <div className="prompt-count-picker"><strong>生成方案数</strong><span>一次生成 1–5 张</span><div>{[1,2,3,4,5].map((count) => <button type="button" className={packagingProject.generationCount === count ? "active" : ""} key={count} onClick={() => updatePackagingProject((current) => ({ ...current, generationCount: count }))}>{count}</button>)}</div></div>
        </div>
        <div className="packaging-prompt-actions"><button className="primary-button" disabled={generating || !packagingProject.designRequirement.trim()} onClick={() => void generate()}>{generating ? "正在生成外包装效果图…" : `生成 ${packagingProject.generationCount} 张外包装方案`}</button></div>
      </div>
    </section>

    <section className="pack-solutions">
      <div className="logo-section-title"><div><span>03</span><div><h2>外包装效果预览</h2><p>{candidates.length ? `${candidates.length} 套方案 · ${packagingProject.generationRound} 轮生成` : "输入设计要求后生成商业效果预览"}</p></div></div>{notice && <span className="generation-notice">{notice}</span>}</div>
      {generating && !candidates.length ? <div className="pack-loading">正在生成制作完成后的外包装效果图…</div> : candidates.length ? <div className="pack-grid">
        {candidates.map((candidate) => {
          const favorite = packagingProject.favoriteIds.includes(candidate.id);
          return <article className={`pack-card ${favorite ? "favorite" : ""}`} key={candidate.id}>
            <div className="pack-preview"><img src={candidate.previewImageUrl} alt="外包装效果方案" /></div>
            <div className="pack-card-body"><div className="pack-card-head"><strong>{candidate.directionName || "外包装设计方案"}</strong></div>
              <div className="pack-card-actions pack-preview-actions"><button onClick={() => { setPreviewZoom(1); setPreview(candidate); }}>查看大图</button><button className={favorite ? "selected-action" : ""} onClick={() => toggleFavorite(candidate)}>{favorite ? "取消已选" : "加入已选"}</button><button className="danger-link" onClick={() => deleteCandidate(candidate)}>删除</button></div></div>
          </article>;
        })}
      </div> : <div className="product-empty"><span>▦</span><p>尚未生成外包装效果图</p><small>输入外包装设计要求后即可生成多方案。</small></div>}
    </section>

    <section className="pack-final-section">
      <div className="logo-section-title"><div><span>04</span><div><h2>已选方案与定稿</h2><p>从效果预览中收藏候选，最终确定一套外包装概念方案</p></div></div><b>{favorites.length}/5</b></div>
      {packagingProject.finalDesign ? <div className="final-pack"><img src={packagingProject.finalDesign.candidate.previewImageUrl} alt="定稿外包装效果" /><div><span className="eyebrow">FINAL PACKAGING PREVIEW</span><h3>{packagingProject.finalDesign.candidate.directionName || "AI 自由设计外包装"}</h3><small>已保存外包装效果预览和生成提示词</small></div><div className="final-actions"><button className="secondary-button" onClick={() => { if (window.confirm("重新选择将撤销当前包装定稿。确认继续吗？")) reopenPackaging(); }}>重新选择</button><button className="primary-button" onClick={() => router.push("/workflow/6")}>进入质检与交付 →</button></div></div> : favorites.length ? <div className="pack-selected-grid">{favorites.map((candidate) => <article key={candidate.id}><img src={candidate.previewImageUrl} alt="已选外包装效果" /><div><strong>{candidate.directionName || "外包装设计方案"}</strong></div><button className="finalize-button" onClick={() => finalizePackaging(candidate.id)}>定稿</button></article>)}</div> : <div className="empty-selected"><p>还没有选择外包装方案</p><small>在效果图下方点击“加入已选”。</small></div>}
    </section>

    {preview && <div className="modal-backdrop preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="pack-effect-preview-modal product-preview-modal final-board" role="dialog" aria-modal="true" aria-label={`外包装方案 ${numberOf(preview.id)} 大图`}><button type="button" onClick={() => setPreview(null)} aria-label="关闭">×</button><div className="preview-zoom-toolbar"><span>滚动鼠标滚轮查看细节</span><button type="button" onClick={() => setPreviewZoom((value) => Math.max(.5, value - .25))}>−</button><b>{Math.round(previewZoom * 100)}%</b><button type="button" onClick={() => setPreviewZoom((value) => Math.min(4, value + .25))}>＋</button><button type="button" onClick={() => setPreviewZoom(1)}>重置</button></div><div className="preview-zoom-stage" onWheel={(event) => { event.preventDefault(); setPreviewZoom((value) => Math.min(4, Math.max(.5, value + (event.deltaY < 0 ? .15 : -.15)))); }}><img style={{ width: `${previewZoom * 100}%` }} src={preview.previewImageUrl} alt={`外包装方案 #${numberOf(preview.id)} 效果大图`} /></div><div className="pack-effect-meta"><strong>方案 #{numberOf(preview.id)} · {preview.directionName || "AI 自由设计外包装"}</strong><span>{preview.palette.join(" / ")}</span><small>概念效果图，不含刀版与印刷工程文件</small></div></section></div>}
  </>;
}
