"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logoGenerator } from "@/services/logo-generator";
import type { LogoCandidate, LogoFontStyle, LogoType } from "@/types/logo";
import { useDesignBrief } from "./design-brief-provider";
import { useAiUsageCount } from "./use-ai-usage-count";

const tweakDirections = ["更简约", "更圆润", "换配色", "换字体气质"];
const logoTypeOptions:{id:LogoType;label:string;tip:string}[]=[
  {id:"wordmark",label:"字标",tip:"纯品牌名文字设计（如 兰蔻）"},{id:"lettermark",label:"字母标",tip:"取首字母缩写设计（如 SK-II）"},{id:"pictorial",label:"图形标",tip:"具象图形（如 苹果）"},{id:"abstract",label:"抽象标",tip:"抽象几何图形（如 欧莱雅）"},{id:"combination",label:"组合标",tip:"图形 + 文字组合"},{id:"emblem",label:"徽章标",tip:"文字封在图形轮廓内（如 星巴克）"},
];
const logoTypeLabels:Record<LogoType,string>=Object.fromEntries(logoTypeOptions.map(item=>[item.id,item.label])) as Record<LogoType,string>;
const fontStyles:{id:LogoFontStyle|null;label:string}[]=[{id:null,label:"不限"},{id:"serif",label:"衬线·优雅经典"},{id:"sans",label:"无衬线·现代理性"},{id:"handwritten",label:"手写·温度自然"}];

function LogoCard({ candidate, number, parentNumber, favorite, final, selectionMode, selected, onFavorite, onVariant, onPreview, onDelete, onToggleSelection }: {
  candidate: LogoCandidate; number: number; parentNumber?: number; favorite: boolean; final: boolean;
  selectionMode: boolean; selected: boolean;
  onFavorite: () => void; onVariant: () => void; onPreview: () => void; onDelete: () => void; onToggleSelection: () => void;
}) {
  return (
    <article className={`logo-card ${favorite ? "favorite" : ""} ${final ? "final" : ""} ${selected ? "batch-selected" : ""}`}>
      <div className="logo-image-wrap">
        <img src={candidate.imageUrl} alt={`Logo 方案 #${number}`} />
        <span className="logo-number">#{number}</span>
        {selectionMode&&<button className={`batch-select-button ${selected?"active":""}`} type="button" disabled={final} onClick={onToggleSelection} aria-label={selected?`取消选择方案 ${number}`:`选择方案 ${number}`} title={final?"定稿方案不能批量删除":"选择此方案"}>{selected?"✓":""}</button>}
        {candidate.parentId && <span className="lineage-badge">↳ 基于方案 #{parentNumber || "-"} 变体</span>}
        {final && <span className="final-badge">✓ 已定稿</span>}
        <button className={`favorite-button ${favorite ? "active" : ""}`} type="button" onClick={onFavorite} aria-label={favorite ? `取消收藏方案 ${number}` : `收藏方案 ${number}`}>{favorite ? "★" : "☆"}</button>
      </div>
      <div className="logo-card-body">
        <div className="logo-tags"><span className="logo-type-tag">{logoTypeLabels[candidate.logoType]||"未分类"}</span>{candidate.styleTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <p className="match-point"><span>✦</span> 呼应卖点：{candidate.matchedSellingPoints.join("、")}</p>
        <div className="logo-card-actions"><button type="button" onClick={onPreview}>查看大图</button><button className="delete-candidate-button" type="button" onClick={onDelete} disabled={final} title={final ? "定稿方案请先重新选择" : "移入历史回收站"}>删除</button><button type="button" onClick={onVariant}>生成变体 <span>→</span></button></div>
      </div>
    </article>
  );
}

export function LogoDesignPage() {
  const router = useRouter();
  const aiUsageCount = useAiUsageCount("logo");
  const { brief, hydrated, completedSteps, logoProject, updateLogoProject, finalizeLogo, reopenLogoSelection } = useDesignBrief();
  const [generating, setGenerating] = useState(false);
  const [variantBase, setVariantBase] = useState<LogoCandidate | null>(null);
  const [preview, setPreview] = useState<LogoCandidate | null>(null);
  const [direction, setDirection] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  const [notice, setNotice] = useState("");
  const [typeFilter,setTypeFilter]=useState<LogoType|"all">("all");
  const [finalizeCandidate,setFinalizeCandidate]=useState<LogoCandidate|null>(null);
  const [recycleOpen,setRecycleOpen]=useState(false);
  const [batchMode,setBatchMode]=useState(false);
  const [batchSelectedIds,setBatchSelectedIds]=useState<Set<string>>(()=>new Set());

  const candidateNumber = (id: string) => logoProject.candidates.findIndex((item) => item.id === id) + 1;
  const favorites = logoProject.favoriteIds.flatMap((id) => {
    const item = logoProject.candidates.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const finalCandidate = logoProject.candidates.find((item) => item.id === logoProject.finalLogoId);
  const rounds = useMemo(() => {
    const grouped = new Map<number, LogoCandidate[]>();
    logoProject.candidates.forEach((candidate) => grouped.set(candidate.round, [...(grouped.get(candidate.round) || []), candidate]));
    return [...grouped.entries()].sort(([a], [b]) => b - a).map(([round, candidates]) => ({
      round,
      candidates: [...candidates].filter(candidate=>typeFilter==="all"||candidate.logoType===typeFilter).sort((a, b) => Number(logoProject.favoriteIds.includes(b.id)) - Number(logoProject.favoriteIds.includes(a.id))),
    })).filter(group=>group.candidates.length);
  }, [logoProject.candidates, logoProject.favoriteIds,typeFilter]);
  const visibleDeletableIds=useMemo(()=>rounds.flatMap(group=>group.candidates).filter(candidate=>candidate.id!==logoProject.finalLogoId).map(candidate=>candidate.id),[rounds,logoProject.finalLogoId]);

  const generate = async (count: number, base?: LogoCandidate, tweak?: string) => {
    if (generating) return;
    setGenerating(true);
    setNotice("");
    const nextRound = logoProject.generationRound + 1;
    try {
      const candidates = await logoGenerator.generate({
        brief,
        styleHint: [logoProject.styleHint, tweak].filter(Boolean).join("；") || undefined,
        baseLogoId: base?.id,
        count,
        logoTypes:base?[base.logoType]:logoProject.logoTypes,
        fontStyle:logoProject.fontStyle,
        fontWeight:logoProject.fontWeight,
        colorPreference:logoProject.colorPreference,
        avoidElements:logoProject.avoidElements,
      },{onCandidate:(candidate)=>updateLogoProject((current)=>current.candidates.some((item)=>item.id===candidate.id)?current:({ ...current, generationRound: nextRound, candidates: [...current.candidates, { ...candidate, round: nextRound }] }))});
      const generatedLabel=candidates.length===count?`${count} 个`:`${candidates.length}/${count} 个`;
      setNotice(base ? `已基于方案 #${candidateNumber(base.id)} 生成 ${generatedLabel} 变体` : `已生成 ${generatedLabel} 新方案`);
    } catch (error) {
      setNotice(`生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`);
    } finally {
      setGenerating(false);
    }
  };

  const toggleFavorite = (candidate: LogoCandidate) => {
    const exists = logoProject.favoriteIds.includes(candidate.id);
    if (!exists && logoProject.favoriteIds.length >= 5) {
      setNotice("最多收藏 5 个方案，请先取消一个已选方案。");
      return;
    }
    updateLogoProject((current) => ({ ...current, favoriteIds: exists ? current.favoriteIds.filter((id) => id !== candidate.id) : [...current.favoriteIds, candidate.id] }));
  };

  const deleteCandidate = (candidate: LogoCandidate) => {
    if (candidate.id === logoProject.finalLogoId) {
      setNotice("定稿方案不能直接删除，请先点击“重新选择”。");
      return;
    }
    if (!window.confirm("删除后方案将进入历史回收站，可随时恢复。确认删除吗？")) return;
    updateLogoProject((current) => ({
      ...current,
      candidates: current.candidates.filter((item) => item.id !== candidate.id),
      favoriteIds: current.favoriteIds.filter((id) => id !== candidate.id),
      deletedCandidates: [
        { candidate, deletedAt: new Date().toISOString(), wasFavorite: current.favoriteIds.includes(candidate.id) },
        ...current.deletedCandidates.filter((item) => item.candidate.id !== candidate.id),
      ],
    }));
    setNotice("方案已移入历史回收站");
  };

  const restoreCandidate = (candidateId: string) => {
    updateLogoProject((current) => {
      const deleted = current.deletedCandidates.find((item) => item.candidate.id === candidateId);
      if (!deleted) return current;
      const canRestoreFavorite = deleted.wasFavorite && current.favoriteIds.length < 5;
      return {
        ...current,
        candidates: [...current.candidates, deleted.candidate],
        favoriteIds: canRestoreFavorite ? [...current.favoriteIds, candidateId] : current.favoriteIds,
        deletedCandidates: current.deletedCandidates.filter((item) => item.candidate.id !== candidateId),
      };
    });
    setNotice("方案已恢复到原生成轮次");
  };

  const permanentlyDeleteCandidate = (candidateId: string) => {
    if (!window.confirm("彻底删除后无法恢复，确认继续吗？")) return;
    updateLogoProject((current) => ({ ...current, deletedCandidates: current.deletedCandidates.filter((item) => item.candidate.id !== candidateId) }));
  };

  const clearRecycleBin = () => {
    if (!logoProject.deletedCandidates.length || !window.confirm("确认彻底清空历史回收站？此操作无法撤销。")) return;
    updateLogoProject((current) => ({ ...current, deletedCandidates: [] }));
  };

  const toggleBatchSelection = (candidateId: string) => {
    setBatchSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId); else next.add(candidateId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const allSelected = visibleDeletableIds.length > 0 && visibleDeletableIds.every((id) => batchSelectedIds.has(id));
    setBatchSelectedIds((current) => {
      const next = new Set(current);
      visibleDeletableIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const batchDeleteCandidates = () => {
    const ids = [...batchSelectedIds].filter((id) => id !== logoProject.finalLogoId && logoProject.candidates.some((candidate) => candidate.id === id));
    if (!ids.length) return;
    if (!window.confirm(`确认将选中的 ${ids.length} 个方案移入历史回收站？`)) return;
    const idSet = new Set(ids);
    updateLogoProject((current) => {
      const deletedAt = new Date().toISOString();
      const newlyDeleted = current.candidates.filter((candidate) => idSet.has(candidate.id)).map((candidate) => ({ candidate, deletedAt, wasFavorite: current.favoriteIds.includes(candidate.id) }));
      return {
        ...current,
        candidates: current.candidates.filter((candidate) => !idSet.has(candidate.id)),
        favoriteIds: current.favoriteIds.filter((id) => !idSet.has(id)),
        deletedCandidates: [...newlyDeleted, ...current.deletedCandidates.filter((item) => !idSet.has(item.candidate.id))],
      };
    });
    setBatchSelectedIds(new Set());
    setBatchMode(false);
    setNotice(`已将 ${ids.length} 个方案移入历史回收站`);
  };

  const confirmVariant = async () => {
    if (!variantBase || !direction) return;
    const base = variantBase;
    setVariantBase(null);
    setDirection("");
    await generate(variantCount, base, direction);
  };

  if (!hydrated) return <div className="form-loading"><span /><p>正在载入 Logo 项目…</p></div>;
  if (!completedSteps.includes(1)) return (
    <div className="placeholder-page"><span className="eyebrow">STEP 2 / 6</span><h1>请先完成品牌与产品定位</h1><p>Logo 方案需要读取第 1 步的 Design Brief。</p><button className="primary-button" type="button" onClick={() => router.push("/workflow/1")}>返回第 1 步</button></div>
  );

  return (
    <>
      <div className="page-heading logo-heading"><div><span className="eyebrow">STEP 2 / 6</span><h1>Logo 设计</h1><p>从品牌策略出发探索多种视觉方向，通过筛选与变体迭代收敛到最终方案。</p></div><span className="mock-badge">生成调用 {aiUsageCount} 次</span></div>

      <section className="logo-input-card">
        <div className="logo-section-head"><div><span>01</span><div><h2>设计输入摘要</h2><p>生成服务将读取以下 Design Brief 信息</p></div></div></div>
        <div className="logo-preferences">
          <div className="preference-block preference-wide"><div className="preference-label"><strong>LOGO 类型</strong><span>多选</span></div><div className="segmented-options logo-type-options"><button type="button" className={!logoProject.logoTypes.length?"active":""} onClick={()=>updateLogoProject(current=>({...current,logoTypes:[]}))}>不限</button>{logoTypeOptions.map(item=><button type="button" title={item.tip} aria-pressed={logoProject.logoTypes.includes(item.id)} className={logoProject.logoTypes.includes(item.id)?"active":""} key={item.id} onClick={()=>updateLogoProject(current=>({...current,logoTypes:current.logoTypes.includes(item.id)?current.logoTypes.filter(type=>type!==item.id):[...current.logoTypes,item.id]}))}>{item.label}</button>)}</div></div>
          <div className="preference-block preference-wide"><div className="preference-label"><strong>字体气质</strong><span>单选</span></div><div className="font-preference-row"><div className="segmented-options font-style-options">{fontStyles.map(item=><button type="button" className={logoProject.fontStyle===item.id?"active":""} key={item.label} onClick={()=>updateLogoProject(current=>({...current,fontStyle:item.id}))}>{item.label}</button>)}</div><label className="weight-slider"><span>纤细</span><input type="range" min="1" max="5" step="1" value={logoProject.fontWeight} onChange={event=>updateLogoProject(current=>({...current,fontWeight:Number(event.target.value)}))}/><span>有力</span><b>{logoProject.fontWeight}/5</b></label></div></div>
          <label className="preference-block"><span className="preference-label"><strong>色彩倾向</strong><em>选填</em></span><input value={logoProject.colorPreference} onChange={event=>updateLogoProject(current=>({...current,colorPreference:event.target.value}))} placeholder="如：冷色调、带一点金色（留空则根据品牌个性自动推导）" maxLength={80}/></label>
          <label className="preference-block"><span className="preference-label"><strong>避免元素</strong><em>选填</em></span><input value={logoProject.avoidElements} onChange={event=>updateLogoProject(current=>({...current,avoidElements:event.target.value}))} placeholder="不希望出现的元素，如：叶子、水滴" maxLength={80}/></label>
          <div className="preference-block preference-wide quantity-preference"><div className="preference-label"><strong>生成数量</strong><span>单次上限 12 个</span></div><div className="segmented-options quantity-options">{[4,8,12].map(count=><button type="button" className={logoProject.generationCount===count?"active":""} key={count} onClick={()=>updateLogoProject(current=>({...current,generationCount:count}))}>{count} 个</button>)}</div></div>
        </div>
        <div className="generation-row">
          <label><span>补充风格描述 <em>选填</em></span><input value={logoProject.styleHint || ""} onChange={(event) => updateLogoProject((current) => ({ ...current, styleHint: event.target.value }))} placeholder="例如：想要更圆润的感觉，避免过于冷峻" maxLength={100} /></label>
          <button className="primary-button generate-button" type="button" onClick={() => void generate(logoProject.generationCount)} disabled={generating}>{generating ? <><i /> 正在生成…</> : <>✦ 生成 {logoProject.generationCount} 个 Logo 方案</>}</button>
        </div>
      </section>

      <section className="logo-workspace-section">
        <div className="logo-section-title"><div><span>02</span><div><h2>方案探索</h2><p>{logoProject.candidates.length ? `${generating?"正在生成 · ":""}共 ${logoProject.candidates.length} 个方案 · ${logoProject.generationRound} 轮探索` : generating ? "正在生成，完成一张即显示一张" : "调整参数后，点击生成开始首轮探索"}</p></div></div><div className="exploration-tools">{batchMode?<><button className="batch-tool-button" type="button" onClick={toggleSelectAllVisible}>{visibleDeletableIds.length>0&&visibleDeletableIds.every(id=>batchSelectedIds.has(id))?"取消全选":"全选当前"}</button><button className="batch-delete-button" type="button" disabled={!batchSelectedIds.size} onClick={batchDeleteCandidates}>删除所选 {batchSelectedIds.size}</button><button className="batch-tool-button" type="button" onClick={()=>{setBatchMode(false);setBatchSelectedIds(new Set())}}>取消</button></>:<button className="batch-tool-button" type="button" onClick={()=>setBatchMode(true)}>批量删除</button>}<button className="recycle-bin-button" type="button" onClick={()=>setRecycleOpen(true)}>历史回收站 <b>{logoProject.deletedCandidates.length}</b></button></div></div>
        {notice.startsWith("生成失败")&&<div className="generation-error" role="alert">{notice}</div>}
        <div className="logo-type-filter"><span>类型筛选</span><button type="button" className={typeFilter==="all"?"active":""} onClick={()=>setTypeFilter("all")}>全部</button>{logoTypeOptions.map(item=><button type="button" className={typeFilter===item.id?"active":""} key={item.id} onClick={()=>setTypeFilter(item.id)}>{item.label}</button>)}</div>
        {generating && logoProject.candidates.length === 0 ? <div className="logo-loading-grid">{Array.from({ length: logoProject.generationCount }).map((_, i) => <span key={i} />)}</div> : rounds.map(({ round, candidates }) => (
          <div className="round-group" key={round}>
            <div className="round-heading"><span>第 {round} 轮</span><i /> <small>{candidates[0]?.parentId ? "变体探索" : "方向探索"} · {candidates.length} 个方案</small></div>
            <div className="logo-grid">{candidates.map((candidate) => <LogoCard key={candidate.id} candidate={candidate} number={candidateNumber(candidate.id)} parentNumber={candidate.parentId ? candidateNumber(candidate.parentId) : undefined} favorite={logoProject.favoriteIds.includes(candidate.id)} final={logoProject.finalLogoId === candidate.id} selectionMode={batchMode} selected={batchSelectedIds.has(candidate.id)} onToggleSelection={()=>toggleBatchSelection(candidate.id)} onFavorite={() => toggleFavorite(candidate)} onVariant={() => { setVariantBase(candidate); setDirection(""); }} onPreview={() => setPreview(candidate)} onDelete={() => deleteCandidate(candidate)} />)}</div>
          </div>
        ))}
      </section>

      <section className="selected-section">
        <div className="logo-section-title"><div><span>03</span><div><h2>已选方案</h2><p>收藏 1–5 个方向，继续迭代或选定最终 Logo</p></div></div><b>{favorites.length}/5</b></div>
        {finalCandidate ? (
          <div className="final-selection"><img src={finalCandidate.imageUrl} alt="最终 Logo" /><div><span className="eyebrow">FINAL LOGO</span><h3>方案 #{candidateNumber(finalCandidate.id)} 已定稿</h3><p>已写入「{brief.brand.name || "未命名品牌"}」品牌资产库，第 2 步已完成。</p></div><div className="final-actions"><button className="secondary-button" type="button" onClick={() => { if (window.confirm("重新选择将撤销当前定稿，并从品牌资产库移除此 Logo。确认继续吗？")) reopenLogoSelection(); }}>重新选择</button><button className="primary-button" type="button" onClick={() => router.push("/workflow/3")}>进入内容规划 <span>→</span></button></div></div>
        ) : favorites.length ? (
          <div className="selected-grid">{favorites.map((candidate) => <div className="selected-logo" key={candidate.id}><img src={candidate.imageUrl} alt={`已选方案 #${candidateNumber(candidate.id)}`} /><div><strong>方案 #{candidateNumber(candidate.id)} · {logoTypeLabels[candidate.logoType]||"未分类"}</strong><span>{candidate.styleTags.join(" · ")}</span></div><button type="button" onClick={() => { setVariantBase(candidate); setDirection(""); }}>生成变体</button><button className="finalize-button" type="button" onClick={() => setFinalizeCandidate(candidate)}>定稿</button></div>)}</div>
        ) : <div className="empty-selected"><span>☆</span><p>还没有收藏方案</p><small>点击方案卡片右上角的星标，将候选加入这里。</small></div>}
      </section>

      {variantBase && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !generating) setVariantBase(null); }}><section className="variant-modal" role="dialog" aria-modal="true" aria-labelledby="variant-title"><div className="modal-head"><div><span className="eyebrow">VARIATION</span><h2 id="variant-title">基于方案 #{candidateNumber(variantBase.id)} 生成变体</h2></div><button type="button" onClick={() => setVariantBase(null)} aria-label="关闭">×</button></div><div className="variant-preview"><img src={variantBase.imageUrl} alt="变体基底方案" /><div><strong>选择一个微调方向</strong><p>将生成 {variantCount} 个新方案，并保留与当前方案的来源关系。</p></div></div><div className="direction-grid">{tweakDirections.map((item) => <button className={direction === item ? "active" : ""} type="button" key={item} onClick={() => setDirection(item)}><span>{item === "更简约" ? "—" : item === "更圆润" ? "○" : item === "换配色" ? "◐" : "Aa"}</span>{item}</button>)}</div><div className="variant-count-picker"><div><strong>生成数量</strong><span>选择 1–5 张图</span></div><div>{[1,2,3,4,5].map(count=><button type="button" className={variantCount===count?"active":""} aria-pressed={variantCount===count} key={count} onClick={()=>setVariantCount(count)}>{count} 张</button>)}</div></div><div className="modal-actions variant-actions"><button className="secondary-button" type="button" onClick={() => setVariantBase(null)}>取消</button><button className="primary-button" type="button" disabled={!direction || generating} onClick={() => void confirmVariant()}>生成 {variantCount} 个变体 <span>→</span></button></div></section></div>}

      {preview && <div className="modal-backdrop preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="logo-preview-modal" role="dialog" aria-modal="true" aria-label={`方案 ${candidateNumber(preview.id)} 大图`}><button type="button" onClick={() => setPreview(null)} aria-label="关闭">×</button><img src={preview.imageUrl} alt={`Logo 方案 #${candidateNumber(preview.id)} 大图`} /><div><strong>方案 #{candidateNumber(preview.id)}</strong><span>{preview.styleTags.join(" · ")}</span></div></section></div>}

      {finalizeCandidate&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setFinalizeCandidate(null)}}><section className="logo-finalize-modal" role="dialog" aria-modal="true" aria-labelledby="logo-finalize-title"><div className="modal-head"><div><span className="eyebrow">APPLICATION CHECK</span><h2 id="logo-finalize-title">确认 Logo 应用表现</h2></div><button type="button" onClick={()=>setFinalizeCandidate(null)} aria-label="关闭">×</button></div><p>确认该 Logo 在各应用场景下表现良好？</p><div className="logo-application-grid"><article><span>小尺寸 · 24px</span><div className="application-stage small"><img src={finalizeCandidate.imageUrl} alt="Logo 小尺寸预览"/></div><small>模拟小样、瓶底或移动端图标</small></article><article><span>单黑版</span><div className="application-stage mono"><img src={finalizeCandidate.imageUrl} alt="Logo 单黑版预览"/></div><small>模拟单色印刷与文件盖章</small></article><article><span>烫金版</span><div className="application-stage gold"><img src={finalizeCandidate.imageUrl} alt="Logo 烫金版预览"/></div><small>模拟金属箔与礼盒工艺</small></article></div><div className="modal-actions finalize-actions"><button className="secondary-button" type="button" onClick={()=>setFinalizeCandidate(null)}>返回修改</button><button className="primary-button" type="button" onClick={()=>{finalizeLogo(finalizeCandidate.id);setFinalizeCandidate(null)}}>确认定稿</button></div></section></div>}

      {recycleOpen&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setRecycleOpen(false)}}><section className="logo-recycle-modal" role="dialog" aria-modal="true" aria-labelledby="logo-recycle-title"><div className="modal-head"><div><span className="eyebrow">HISTORY & RECOVERY</span><h2 id="logo-recycle-title">历史回收站</h2></div><button type="button" onClick={()=>setRecycleOpen(false)} aria-label="关闭">×</button></div><div className="recycle-summary"><p>删除的方案会保存在当前项目中，恢复后回到原生成轮次。</p>{logoProject.deletedCandidates.length>0&&<button type="button" onClick={clearRecycleBin}>清空回收站</button>}</div>{logoProject.deletedCandidates.length?<div className="recycle-list">{logoProject.deletedCandidates.map(item=><article key={item.candidate.id}><img src={item.candidate.imageUrl} alt="已删除 Logo 方案"/><div><strong>{logoTypeLabels[item.candidate.logoType]} · 第 {item.candidate.round} 轮</strong><span>删除于 {new Date(item.deletedAt).toLocaleString("zh-CN")}</span>{item.wasFavorite&&<small>删除前已收藏</small>}</div><button type="button" onClick={()=>restoreCandidate(item.candidate.id)}>恢复</button><button className="permanent-delete" type="button" onClick={()=>permanentlyDeleteCandidate(item.candidate.id)}>彻底删除</button></article>)}</div>:<div className="recycle-empty"><span>♻</span><p>回收站为空</p><small>删除的 Logo 方案会出现在这里</small></div>}</section></div>}
    </>
  );
}
