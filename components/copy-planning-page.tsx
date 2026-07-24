"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { copyGenerator } from "@/services/copy-generator";
import { copyFieldKeys, copyFieldLabels, type CopyField, type CopyPackage } from "@/types/copy";
import { useDesignBrief } from "./design-brief-provider";
import { useAiUsageCount } from "./use-ai-usage-count";

function EditableTagField({ icon, label, values, placeholder, onChange }: { icon: string; label: string; values: string[]; placeholder: string; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
  };
  return <div className="editable-brief-field"><div className="editable-field-title"><span>{icon}</span><strong>{label}</strong><small>{values.length} 项</small></div><div className="editable-tag-list">{values.map((value,index)=><label key={`${index}-${value}`}><input style={{width:`${Math.min(320,Math.max(88,value.length*15+28))}px`}} value={value} title={value} aria-label={`${label} ${index+1}`} onChange={event=>onChange(values.map((item,itemIndex)=>itemIndex===index?event.target.value:item))}/><button type="button" aria-label={`删除${value}`} onClick={()=>onChange(values.filter((_,itemIndex)=>itemIndex!==index))}>×</button></label>)}<div className="tag-add-row"><input value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();add()}}} placeholder={placeholder}/><button type="button" onClick={add}>＋</button></div></div></div>;
}

function CopyPackageCard({ item, number, parentNumber, insightText, onSelectAll, onSelectField, onRewrite, onVariant, onInsight, onCopy }: {
  item: CopyPackage; number: number; parentNumber?: number; insightText: (id?: string) => string;
  onSelectAll: () => void; onSelectField: (field: CopyField) => void; onRewrite: (field: CopyField) => void;
  onVariant: () => void; onInsight: (id: string) => void; onCopy: (field: CopyField) => void;
}) {
  return (
    <article className="copy-package-card">
      <header><div><span className="copy-direction-number">方向 {number}</span><h3>{item.directionName}</h3><p>{item.toneTags.map((tag) => <em key={tag}>{tag}</em>)}</p></div><button type="button" onClick={onSelectAll}>整套选用</button></header>
      {item.parentId && <div className="copy-lineage">↳ 基于方向 #{parentNumber || "-"} 的第 {item.round} 轮变体</div>}
      <div className="copy-fields">{item.fields.map((entry) => (
        <section className="copy-field-row" key={entry.key}>
          <div className="copy-field-head"><strong>{entry.label}</strong><div><button type="button" onClick={() => onCopy(entry)}>复制</button><button type="button" onClick={() => onRewrite(entry)}>单条重写</button><button className="pick-copy-button" type="button" onClick={() => onSelectField(entry)}>选用此条</button></div></div>
          <p>{entry.content}</p>
          {entry.linkedInsightId && <button className="insight-link" title={insightText(entry.linkedInsightId)} type="button" onClick={() => onInsight(entry.linkedInsightId!)}>↗ 关联洞察：{insightText(entry.linkedInsightId)}</button>}
        </section>
      ))}</div>
      <footer><span>{item.sourceInsightIds.length ? `引用 ${item.sourceInsightIds.length} 条产品洞察` : "基于产品信息生成"}</span><button type="button" onClick={onVariant}>整套生成变体 <b>→</b></button></footer>
    </article>
  );
}

export function CopyPlanningPage() {
  const router = useRouter();
  const aiUsageCount = useAiUsageCount("copy");
  const { brief, hydrated, completedSteps, logoProject, copyProject, setBrief, updateCopyProject, finalizeCopy, reopenCopySelection } = useDesignBrief();
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [rewriteField, setRewriteField] = useState<CopyField | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriteOptions, setRewriteOptions] = useState<string[]>([]);
  const [rewriting, setRewriting] = useState(false);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const finalLogo = logoProject.candidates.find((item) => item.id === logoProject.finalLogoId);

  const packageNumber = (id: string) => copyProject.packages.findIndex((item) => item.id === id) + 1;
  const insightText = (id?: string) => brief.insights.find((item) => item.id === id)?.content || "产品洞察";
  const rounds = useMemo(() => {
    const map = new Map<number, CopyPackage[]>();
    copyProject.packages.forEach((item) => map.set(item.round, [...(map.get(item.round) || []), item]));
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [copyProject.packages]);

  const generate = async (base?: CopyPackage) => {
    if (generating) return;
    setGenerating(true);
    const nextRound = copyProject.generationRound + 1;
    try {
      const generated = await copyGenerator.generate({
        brief,
        finalLogo: finalLogo ? { id: finalLogo.id, styleTags: finalLogo.styleTags } : undefined,
        toneHint: copyProject.toneHint,
        baseCopyId: base?.id,
      });
      updateCopyProject((current) => ({ ...current, generationRound: nextRound, packages: [...current.packages, ...generated.map((item) => ({ ...item, round: nextRound }))] }));
      setNotice(base ? `已基于“${base.directionName}”生成 3 套变体` : "已生成 3 套差异化文案方案");
    } catch (error) { setNotice(`生成失败：${error instanceof Error ? error.message : "服务返回未知错误"}`); }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    if (!hydrated || !completedSteps.includes(2) || copyProject.packages.length || autoStarted.current) return;
    autoStarted.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, completedSteps, copyProject.packages.length]);

  const selectField = (entry: CopyField) => updateCopyProject((current) => ({ ...current, assembledFields: { ...current.assembledFields, [entry.key]: { ...entry } } }));
  const selectWhole = (item: CopyPackage) => updateCopyProject((current) => ({ ...current, assembledFields: Object.fromEntries(item.fields.map((entry) => [entry.key, { ...entry }])) }));
  const copyOne = async (entry: CopyField) => { try { await navigator.clipboard.writeText(entry.content); setNotice(`已复制「${entry.label}」`); } catch { setNotice("复制失败，请手动选择文本复制。"); } };
  const requestRewrite = async () => {
    if (!rewriteField || !rewriteInstruction.trim()) return;
    setRewriting(true);
    try { setRewriteOptions(await copyGenerator.rewriteField({ field: rewriteField, instruction: rewriteInstruction, brief })); }
    catch (error) { setNotice(`重写失败：${error instanceof Error ? error.message : "服务返回未知错误"}`); }
    finally { setRewriting(false); }
  };
  const chooseRewrite = (content: string) => {
    if (!rewriteField) return;
    selectField({ ...rewriteField, content });
    setRewriteField(null); setRewriteInstruction(""); setRewriteOptions([]);
    setNotice(`已将改写版本加入最终文案包`);
  };
  const readyToFinalize = copyFieldKeys.every((key) => copyProject.assembledFields[key]?.content.trim());
  const finalize = () => {
    if (!readyToFinalize) return;
    const fields = copyFieldKeys.map((key) => copyProject.assembledFields[key]!) as CopyField[];
    finalizeCopy({
      id: `final-copy-${Date.now()}`, directionName: "自定义组装文案", toneTags: ["已定稿"], fields,
      sourceInsightIds: [...new Set(fields.flatMap((entry) => entry.linkedInsightId ? [entry.linkedInsightId] : []))],
      round: copyProject.generationRound,
    });
  };

  if (!hydrated) return <div className="form-loading"><span /><p>正在载入文案项目…</p></div>;
  if (!completedSteps.includes(2)) return <div className="placeholder-page"><span className="eyebrow">STEP 3 / 6</span><h1>请先完成 Logo 设计</h1><p>内容规划会读取已定稿 Logo 的风格标签。</p><button className="primary-button" type="button" onClick={() => router.push("/workflow/2")}>返回第 2 步</button></div>;

  return (
    <>
      <div className="page-heading copy-heading"><div><span className="eyebrow">STEP 3 / 6</span><h1>内容规划</h1><p>把产品卖点与用户洞察转化为完整、可溯源的包装文案体系。</p></div><span className="mock-badge">生成调用 {aiUsageCount} 次</span></div>

      <section className="copy-input-card">
        <div className="logo-section-head editable-brief-head"><div><span>01</span><div><h2>Design Brief 信息</h2><p>可直接修改，保存后将作为下一次文案生成的依据</p></div></div><span className="editable-status"><i/>已自动保存</span></div>
        <div className="editable-copy-summary">
          <EditableTagField icon="✦" label="核心卖点" values={brief.product.coreSellingPoints.map(item=>item.point)} placeholder="添加核心卖点" onChange={values=>setBrief({...brief,product:{...brief.product,coreSellingPoints:values.map((point,index)=>{const sourceInsightId=brief.product.coreSellingPoints.find(item=>item.point===point)?.sourceInsightId||brief.product.coreSellingPoints[index]?.sourceInsightId;return {point,...(sourceInsightId?{sourceInsightId}:{})}})}})}/>
          <EditableTagField icon="○" label="核心功效" values={brief.product.efficacy} placeholder="添加核心功效" onChange={efficacy=>setBrief({...brief,product:{...brief.product,efficacy}})}/>
          <EditableTagField icon="◇" label="关键成分" values={brief.product.keyIngredients} placeholder="添加关键成分" onChange={keyIngredients=>setBrief({...brief,product:{...brief.product,keyIngredients}})}/>
          <EditableTagField icon="◎" label="品牌个性" values={brief.brand.personality} placeholder="添加品牌个性" onChange={personality=>setBrief({...brief,brand:{...brief.brand,personality}})}/>
        </div>
        <div className="editable-insights-area"><div className="insights-title"><strong>产品洞察</strong><span>{brief.insights.length} 条 · 可修改</span></div>{brief.insights.length?<div className="editable-insight-grid">{brief.insights.map((insight,index)=><article key={insight.id} className={insight.type}><div className="insight-edit-head"><select value={insight.type} aria-label={`洞察 ${index+1} 类型`} onChange={event=>setBrief({...brief,insights:brief.insights.map(item=>item.id===insight.id?{...item,type:event.target.value as typeof insight.type}:item)})}><option value="pain_point">痛点</option><option value="opportunity">机会点</option><option value="need">需求</option></select><label>提及次数 <input type="number" min="0" max="99999" value={insight.frequency} onChange={event=>setBrief({...brief,insights:brief.insights.map(item=>item.id===insight.id?{...item,frequency:Math.max(0,Number(event.target.value)||0)}:item)})}/></label><button type="button" onClick={()=>{if(window.confirm("确认删除这条产品洞察？"))setBrief({...brief,insights:brief.insights.filter(item=>item.id!==insight.id)})}}>删除</button></div><textarea rows={4} maxLength={500} value={insight.content} aria-label={`洞察 ${index+1} 内容`} onChange={event=>setBrief({...brief,insights:brief.insights.map(item=>item.id===insight.id?{...item,content:event.target.value}:item)})}/><small>Insight ID · {insight.id}</small></article>)}</div>:<div className="no-insights">当前没有产品洞察，可手动添加后用于文案生成。</div>}<button className="add-insight-button" type="button" onClick={()=>setBrief({...brief,insights:[...brief.insights,{id:`manual-insight-${Date.now()}`,type:"pain_point",content:"",frequency:0}]})}>＋ 添加产品洞察</button></div>
        <div className="generation-row copy-generation-row"><label><span>补充语气要求 <em>选填</em></span><input value={copyProject.toneHint || ""} onChange={(event) => updateCopyProject((current) => ({ ...current, toneHint: event.target.value }))} placeholder="例如：更年轻一点，但不要网络用语" maxLength={100} /></label><button className="primary-button generate-button" type="button" onClick={() => void generate()} disabled={generating}>{generating ? <><i /> 正在生成…</> : <>✦ 生成文案方案</>}</button></div>
      </section>

      <section className="copy-compare-section">
        <div className="logo-section-title"><div><span>02</span><div><h2>文案方案对比</h2><p>{copyProject.packages.length ? `${copyProject.packages.length} 套方案 · ${copyProject.generationRound} 轮探索` : "正在准备首轮文案"}</p></div></div>{notice && <span className="generation-notice">{notice}</span>}</div>
        {generating && !copyProject.packages.length ? <div className="copy-loading"><span /><span /><span /></div> : rounds.map(([round, items]) => <div className="copy-round" key={round}><div className="round-heading"><span>第 {round} 轮</span><i /><small>{items[0]?.parentId ? "方向变体" : "首轮方向"} · {items.length} 套</small></div><div className="copy-package-grid">{items.map((item) => <CopyPackageCard key={item.id} item={item} number={packageNumber(item.id)} parentNumber={item.parentId ? packageNumber(item.parentId) : undefined} insightText={insightText} onSelectAll={() => selectWhole(item)} onSelectField={selectField} onRewrite={(entry) => { setRewriteField(entry); setRewriteInstruction(""); setRewriteOptions([]); selectField(entry); }} onVariant={() => void generate(item)} onInsight={setActiveInsightId} onCopy={(entry) => void copyOne(entry)} />)}</div></div>)}</section>

      <section className="copy-assembly-section">
        <div className="logo-section-title"><div><span>03</span><div><h2>最终文案包</h2><p>跨方案挑选并手动编辑，组装最终输出</p></div></div><b>{copyFieldKeys.filter((key) => copyProject.assembledFields[key]?.content).length}/6</b></div>
        {copyProject.finalPackage ? <div className="final-copy-package"><div className="final-copy-head"><div><span className="eyebrow">FINAL COPY PACKAGE</span><h3>包装文案已定稿</h3><p>已写入品牌资产库，并将随项目交付包一同导出。</p></div><div><button className="secondary-button" type="button" onClick={() => { if (window.confirm("重新选择将撤销当前文案定稿，并从品牌资产库移除此文案资产。确认继续吗？")) reopenCopySelection(); }}>重新选择</button><button className="primary-button" type="button" onClick={() => router.push("/workflow/4")}>进入产品图设计 <span>→</span></button></div></div><div className="final-copy-list">{copyProject.finalPackage.fields.map((entry) => <div key={entry.key}><small>{entry.label}</small><p>{entry.content}</p></div>)}</div></div> : <><div className="assembly-list">{copyFieldKeys.map((key) => { const entry = copyProject.assembledFields[key]; return <label className={entry ? "filled" : ""} key={key}><div><strong>{copyFieldLabels[key]}</strong>{entry?.linkedInsightId && <button type="button" onClick={() => setActiveInsightId(entry.linkedInsightId!)}>已关联洞察 ↗</button>}<span>{entry?.content.length || 0}/200</span></div><textarea rows={key === "main_slogan" || key === "sub_slogan" ? 2 : 3} maxLength={200} value={entry?.content || ""} onChange={(event) => updateCopyProject((current) => ({ ...current, assembledFields: { ...current.assembledFields, [key]: { key, label: copyFieldLabels[key], content: event.target.value, ...(entry?.linkedInsightId ? { linkedInsightId: entry.linkedInsightId } : {}) } } }))} placeholder={`从上方选择一条${copyFieldLabels[key]}，或直接输入`} /><button className="inline-rewrite" type="button" disabled={!entry?.content} onClick={() => entry && setRewriteField(entry)}>✦ 单条重写</button></label>; })}</div><div className="assembly-footer"><span>{readyToFinalize ? "✓ 文案包已完整，可以定稿" : "请补齐 6 项包装文案后定稿"}</span><button className="primary-button" type="button" disabled={!readyToFinalize} onClick={finalize}>确认文案并定稿 <span>→</span></button></div></>}
      </section>

      {rewriteField && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !rewriting) setRewriteField(null); }}><section className="rewrite-modal" role="dialog" aria-modal="true" aria-labelledby="rewrite-title"><div className="modal-head"><div><span className="eyebrow">SINGLE REWRITE</span><h2 id="rewrite-title">重写「{rewriteField.label}」</h2></div><button type="button" onClick={() => setRewriteField(null)} aria-label="关闭">×</button></div><div className="rewrite-source"><small>当前文案</small><p>{rewriteField.content}</p></div><label><span>改写要求</span><input value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="例如：再短一点、更口语化" /></label><button className="primary-button rewrite-submit" type="button" disabled={!rewriteInstruction.trim() || rewriting} onClick={() => void requestRewrite()}>{rewriting ? "正在改写…" : "生成 3 个替代版本"}</button>{rewriteOptions.length > 0 && <div className="rewrite-options">{rewriteOptions.map((option, index) => <button type="button" key={option} onClick={() => chooseRewrite(option)}><span>版本 {index + 1}</span><p>{option}</p><b>选用</b></button>)}</div>}</section></div>}

      {activeInsightId && <div className="modal-backdrop insight-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveInsightId(null); }}><section className="insight-detail-modal" role="dialog" aria-modal="true" aria-label="产品洞察详情"><button type="button" onClick={() => setActiveInsightId(null)} aria-label="关闭">×</button><span>模块 A 来源洞察</span><h3>{insightText(activeInsightId)}</h3><p>频次：{brief.insights.find((item) => item.id === activeInsightId)?.frequency || 0} 次提及</p><small>Insight ID · {activeInsightId}</small></section></div>}
    </>
  );
}
