'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useDesignBrief } from './design-brief-provider';
import { RegionEditor } from './region-editor';
import { copyGenerator } from '@/services/copy-generator';
import { generateQuickDesign, groundedBrief } from '@/services/quick-design';
import { studioCreativeTask } from '@/services/studio-creative-client';
import { importBriefFromDocument, importBriefFromImages, isBriefImageFile } from '@/services/document-brief-importer';
import { localImage, prepareUpload } from '@/lib/studio-images';
import { pollImageJob, startImageJob } from '@/lib/ai-client';
import { recordAiUsage } from '@/lib/ai-usage';
import type { AssetKind, QuickBundle, StudioState, CreativeStep, DesignPlan, DesignReview } from '@/types/studio';

const labels: Record<string, string> = { idle: '准备资料', plan: '确定整套视觉方案', copy: '规划包装文案', logo: '设计品牌 Logo', product: '设计产品瓶身', packaging: '设计外包装', completed: '整套方案已生成' };
const assetNames: Record<AssetKind, string> = { logo: '品牌 Logo', product: '内包装 / 瓶身', packaging: '外包装' };
for (const [kind, name] of Object.entries(assetNames)) { labels[`review:${kind}`] = `审稿：${name}`; labels[`repair:${kind}`] = `修正：${name}`; labels[`compare:${kind}`] = `比较原图与修正版：${name}`; }
const resetDraft = { draft: {}, direction: undefined, reviews: {}, stage: 'idle', pending: undefined, creativePending: undefined, error: undefined };
export function QuickDesignStudio() {
  const ctx = useDesignBrief();
  const { brief, studio, hydrated } = ctx;
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [kind, setKind] = useState<AssetKind>('packaging'), [settingsOpen, setSettingsOpen] = useState(false);
  const [documentDragging, setDocumentDragging] = useState(false);
  const documentDragDepth = useRef(0);
  const projectRef = useRef(brief.projectId), mounted = useRef(true);
  projectRef.current = brief.projectId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const patch = (value: Partial<StudioState>) => ctx.updateStudio(brief.projectId, s => ({ ...s, ...value }));
  const logo = ctx.logoProject.candidates.find(c => c.id === ctx.logoProject.finalLogoId), product = ctx.productDesign.candidates.find(c => c.id === ctx.productDesign.finalDesignId), packaging = ctx.packagingProject.finalDesign?.candidate;
  const assets = { logo: logo && { id: logo.id, url: logo.imageUrl }, product: product && { id: product.id, url: product.imageUrl }, packaging: packaging && { id: packaging.id, url: packaging.previewImageUrl } };
  const activeAsset = assets[kind], ready = !!logo && !!product && !!packaging;
  const locked = !!busy || !!studio.pending || !!studio.creativePending;
  const assetReview = studio.reviews?.[kind];
  const currentReview = assetReview && activeAsset?.url === (assetReview.selected === 'revised' ? assetReview.revised : assetReview.original) ? assetReview : undefined;
  const reviewResult = currentReview?.comparison || currentReview?.review;
  const active = (id: string) => mounted.current && projectRef.current === id;
  async function upload(file: File, type: 'reference' | 'document') {
    if (locked) return;
    if (type === 'document') {
      if (!/\.(pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name)) { setNotice('请选择 PDF、Word（.docx）、TXT 或 PNG / JPG / WebP 图片。'); return; }
      if (file.size > 15 * 1024 * 1024) { setNotice('产品文档不能超过 15MB，请缩小文件后重新上传。'); return; }
    }
    const id = brief.projectId; setBusy(type === 'reference' ? '正在读取参考图…' : '正在提取产品文档…'); setNotice('');
    try {
      if (type === 'reference') { const dataUrl = await prepareUpload(file); if (active(id)) patch({ reference: { name: file.name, dataUrl, mode: studio.reference ? studio.reference.mode || 'structure' : 'style' }, ...resetDraft }); }
      else {
        const result = isBriefImageFile(file) ? await importBriefFromImages([file], id) : await importBriefFromDocument(file, id);
        if (active(id)) { ctx.importParsedBrief(groundedBrief(result.brief, result.fieldSources), result.fieldSources); patch({ documentName: file.name, ...resetDraft }); setNotice('已提取资料。未在文档中提供的功效、成分和规格不会自动补造。'); }
      }
    } catch (e) { if (active(id)) setNotice(e instanceof Error ? e.message : '上传失败'); }
    finally { if (active(id)) setBusy(''); }
  }
  async function generate(sync = false) {
    if (busy) return;
    const id = brief.projectId; setBusy('正在生成整套方案…'); setNotice('');
    // Persist the adopted structure in the draft so syncing can resume without an upload.
    const syncContainer: QuickBundle['container'] | undefined = product ? {
      ...studio.draft.container, ...product.containerType, sketchUrl: product.imageUrl, referenceImageUrl: product.imageUrl,
      suitableCategories: [brief.product.category], volumeOptions: [product.containerType.volume],
      costLevel: studio.draft.container?.costLevel || 2, materialOptions: studio.draft.container?.materialOptions || [product.cmf.material], viewMode: 'three_view',
    } : undefined;
    const initial = sync ? { ...studio, stage: 'sync', draft: { logo, copy: ctx.copyProject.finalPackage, container: syncContainer }, reviews: {}, pending: undefined, creativePending: undefined } : studio.stage === "completed" ? { ...studio, draft: {}, reviews: {}, pending: undefined, creativePending: undefined } : studio;
    const onCreativePending = (step: CreativeStep) => (jobId: string) => ctx.updateStudio(id, s => ({ ...s, creativePending: { step, jobId } }));
    const creativeContext = { brief, styleHint: initial.styleHint, referenceMode: initial.reference ? initial.reference.mode || 'structure' as const : undefined };
    try {
      const bundle = await generateQuickDesign(brief, initial, {
        active: () => active(id), checkpoint: value => ctx.updateStudio(id, s => ({ ...s, ...value })),
        plan: pendingId => studioCreativeTask<DesignPlan>({ action: 'plan', ...creativeContext, reference: initial.reference?.dataUrl }, pendingId, onCreativePending('plan')),
        review: (stage, plan, original, references, revised, pendingId, copyText) => studioCreativeTask<DesignReview>({ action: 'review', ...creativeContext, kind: stage, plan, original, revised, references, copyText }, pendingId, onCreativePending(`${revised ? 'compare' : 'review'}:${stage}`)),
        copy: async (b, hint) => { const options = await copyGenerator.generate({ brief: b, toneHint: hint }); if (!options[0]?.fields?.length) throw new Error('文案没有返回有效内容'); return options[0]; },
        image: async (stage, prompt, refs, pendingId, phase) => {
          if (!active(id)) throw new Error('已离开当前项目');
          const jobId = pendingId || await startImageJob({ provider: 'fal', prompts: [prompt], referenceImageGroups: [refs], size: stage === 'logo' ? '1024x1024' : '1536x1024', quality: 'high' });
          ctx.updateStudio(id, s => ({ ...s, pending: { stage, jobId, phase } }));
          const result = await pollImageJob<string[]>(jobId);
          if (!result.data[0]) throw new Error('任务完成但未返回图片');
          const url = await localImage(result.data[0]);
          recordAiUsage({ generator: stage, provider: "fal", durationMs: 0, ...result.usage, success: true });
          // Stage and image are checkpointed together after the promise returns.
          return url;
        },
      });
      if (active(id)) { ctx.commitStudioBundle(id, bundle); setKind('packaging'); setSettingsOpen(false); }
    } catch (e) { if (active(id)) patch({ error: e instanceof Error ? e.message : '生成失败' }); }
    finally { if (active(id)) setBusy(''); }
  }
  if (!hydrated) return <div className="studio-placeholder">正在读取项目…</div>;
  return <div className="quick-studio">
    <header className="studio-heading"><div><div className="studio-eyebrow">PACKPILOT / DESIGN STUDIO</div><h1>{settingsOpen && ready ? '调整资料，继续设计。' : ready ? '让好设计，再进一步。' : '一份产品资料，开始整套原创设计。'}</h1><p>{settingsOpen && ready ? '已保留文档提取结果，无需重新上传或解析。已有设计和历史版本仍会保留。' : ready ? '点选想修改的地方，告诉 AI 你的想法。每一步都可以回看。' : '上传产品文档，AI 从零设计瓶型、瓶盖、Logo、文案与外包装。内外包装输出白底三视图。'}</p></div>{ready && !settingsOpen && <Link className="studio-primary" href="/workflow/6">质检与交付 ↗</Link>}</header>
    {(!ready || settingsOpen) && <section className="studio-setup">
      <label className={`studio-upload${documentDragging ? ' is-dragging' : ''}`}
        onDragEnter={e => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          documentDragDepth.current += 1;
          if (!locked) setDocumentDragging(true);
        }}
        onDragOver={e => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = locked ? 'none' : 'copy';
        }}
        onDragLeave={e => {
          e.preventDefault();
          documentDragDepth.current = Math.max(0, documentDragDepth.current - 1);
          if (!documentDragDepth.current) setDocumentDragging(false);
        }}
        onDrop={e => {
          e.preventDefault();
          documentDragDepth.current = 0;
          setDocumentDragging(false);
          if (locked) return;
          const files = e.dataTransfer.files;
          if (!files.length) return;
          if (files.length !== 1) { setNotice('每次请上传一份产品文档，多份资料可合并后上传。'); return; }
          void upload(files[0], 'document');
        }}>
        <input type="file" aria-label="上传产品文档" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" disabled={locked} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, 'document'); e.target.value = ''; }} />
        <span className="upload-symbol">▤</span>
        <strong>{documentDragging ? '松开即可上传文档' : studio.documentName || '拖拽产品文档到这里，或点击上传'}</strong>
        <span>{studio.documentName ? '拖拽或点击可替换文档，自动重新提取产品信息' : '自动提取品牌、卖点与产品信息，直接开始设计'}</span>
        <small>PDF / Word（.docx）/ TXT / 图片 · 最大 15MB</small>
      </label>
      {(studio.documentName || brief.brand.name || brief.product.name) && <div className="studio-facts"><label>品牌名<input disabled={locked} value={brief.brand.name} onChange={e => { ctx.setBrief({ ...brief, brand: { ...brief.brand, name: e.target.value } }); patch({ ...resetDraft }); }} /></label><label>产品名<input disabled={locked} value={brief.product.name} onChange={e => { ctx.setBrief({ ...brief, product: { ...brief.product, name: e.target.value } }); patch({ ...resetDraft }); }} /></label><div><small>已提取的产品信息</small><p>{[brief.product.category, ...brief.product.coreSellingPoints.map(p => p.point)].filter(Boolean).join(' · ') || '文档未提供更多产品事实'} <Link href="/workflow/1">查看与修改全部资料 ↗</Link></p></div></div>}
      <details className="studio-reference" open={!!studio.reference}>
        <summary>添加参考图 <small>可选 · 有喜欢的风格或现成瓶型时使用</small></summary>
        <p className="studio-help">不上传图片时，AI 根据产品资料自主设计瓶型、瓶盖、材质与配色。</p>
        <label className="studio-upload"><input type="file" aria-label="上传可选参考图" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, 'reference'); e.target.value = ''; }} />{studio.reference ? <img src={studio.reference.dataUrl} alt="可选设计参考" /> : <span className="upload-symbol">＋</span>}<strong>{studio.reference?.name || '上传参考图（可选）'}</strong><span>可参考风格，也可选择保留现有瓶型</span><small>PNG / JPG / WebP · 最大 15MB</small></label>
        {studio.reference && <><div className="studio-reference-actions"><label>参考图用途<select disabled={locked} value={studio.reference.mode || 'structure'} onChange={e => patch({ reference: { ...studio.reference!, mode: e.target.value as 'style' | 'structure' }, ...resetDraft })}><option value="style">仅参考风格，自主设计瓶型</option><option value="structure">保留现有瓶型，重新设计视觉</option></select></label><button disabled={locked} onClick={() => patch({ reference: undefined, ...resetDraft })}>移除参考图</button></div><p className="studio-help">{studio.reference.mode === 'style' ? '借鉴配色和材质氛围，瓶型与开口方式仍由 AI 原创设计。' : '保留参考图的器型、比例、瓶盖和开口方式，重新设计 Logo、标签与配套包装。'}</p></>}
      </details>
      <label className="studio-direction">设计想法 <small>可不填，让 AI 根据资料决定</small><input disabled={locked} value={studio.styleHint} onChange={e => patch({ styleHint: e.target.value, ...resetDraft })} placeholder="例如：自然、克制，适合年轻人的高端护肤品牌" /></label>
      <div className="studio-start"><span>✦ GPT Image 2.5 · high 画质 · 纯白底 · 内外包装三视图</span>{ready && <button disabled={!!busy} onClick={() => setSettingsOpen(false)}>返回设计结果</button>}<button className="studio-primary" disabled={!!busy || !brief.brand.name.trim() || !brief.product.name.trim() || (!studio.documentName && !ctx.completedSteps.includes(1))} onClick={() => generate()}>{studio.stage === "completed" ? "重新生成整套方案" : studio.pending || Object.keys(studio.draft).length ? '继续生成未完成部分' : '一键生成整套方案 →'}</button></div>
    </section>}
    {busy && <div className="studio-progress" role="status"><div><i className="studio-spinner"/><strong>{busy}</strong></div><ol>{['plan', 'copy', 'logo', 'product', 'packaging'].map(stage => <li className={studio.stage === stage || studio.stage.endsWith(`:${stage}`) ? 'current' : (stage === 'plan' ? studio.direction : studio.draft[stage as keyof typeof studio.draft]) ? 'done' : ''} key={stage}><span>{(stage === 'plan' ? studio.direction : studio.draft[stage as keyof typeof studio.draft]) ? '✓' : '•'}</span>{labels[stage]}</li>)}</ol><p>当前：{labels[studio.stage] || studio.stage}。按任务 ID 查询结果，已完成的部分会保留。</p></div>}
    {studio.error && <div className="studio-error" role="alert">{studio.error}<p>已完成的部分仍在。可继续查询；若任务已失败或过期，可仅重试未完成部分。</p><button disabled={!!busy} onClick={() => { patch({ pending: undefined, creativePending: undefined, error: undefined }); setSettingsOpen(true); }}>清除失败任务，保留已完成部分</button></div>}
    {!busy && ready && studio.stage !== 'completed' && (studio.pending || studio.creativePending) && <div className="studio-notice">还有未完成的设计任务。<button onClick={() => generate()}>继续生成未完成部分</button></div>}
    {studio.direction && <details className="studio-copy"><summary>本套设计方向 · {studio.direction.plan.concept}</summary><p>{studio.direction.plan.referenceInsights}</p><div className="studio-copy-fields">{[['配色', studio.direction.plan.palette.map(p => `${p.color}：${p.role}`).join('；')], ['字体与信息层级', studio.direction.plan.typography], ['Logo', studio.direction.plan.logo], ['内包装', studio.direction.plan.product], ['外包装', studio.direction.plan.packaging]].map(([label, value]) => <article key={label}><small>{label}</small><p>{value}</p></article>)}</div></details>}
    {notice && <div className="studio-notice" role="status">{notice}</div>}
    {ready && !settingsOpen && <><div className="studio-result-bar"><div className="studio-tabs" role="tablist" aria-label="设计成果">{(['packaging', 'product', 'logo'] as const).map(k => <button role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} disabled={!!busy || !!studio.edit} key={k} onClick={() => setKind(k)}>{assetNames[k]}</button>)}</div><button disabled={!!busy || !!studio.edit} onClick={() => { setSettingsOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>← 返回第一步</button></div>
      {currentReview && !busy && <details className="studio-copy" open={!!currentReview.warning}><summary>{currentReview.warning ? '审稿未完成 · 已保留原图' : currentReview.revised ? `已比较两个版本 · ${currentReview.selected === 'revised' ? '采用修正版' : '保留原图'}` : '已完成 AI 审稿'}</summary>{currentReview.warning ? <p role="status">{currentReview.warning}</p> : <><p>{reviewResult?.summary}</p>{reviewResult?.issues.map((issue, i) => <p key={i}><strong>{issue.location}：</strong>{issue.problem} 建议：{issue.fix}</p>)}</>}<small>AI 审稿仅供辅助判断，原图和修正版均可在下方版本记录中查看。</small></details>}
      {activeAsset && !busy && <RegionEditor key={activeAsset.id} assetKind={kind} imageUrl={activeAsset.url} autoRecognize={!Object.prototype.hasOwnProperty.call(studio.regions, activeAsset.id)} brandName={brief.brand.name} productName={brief.product.name} regions={studio.regions[activeAsset.id] || []} onRegions={regions => ctx.updateStudio(brief.projectId, s => ({ ...s, regions: { ...s.regions, [activeAsset.id]: regions } }))} pending={studio.edit?.assetId === activeAsset.id ? studio.edit.pending : undefined} onPending={pending => ctx.updateStudio(brief.projectId, s => ({ ...s, edit: pending ? { kind, assetId: activeAsset.id, pending } : undefined }))} onAdopt={(url, instruction) => { ctx.adoptStudioImage(brief.projectId, kind, url, instruction); setNotice(kind === 'packaging' ? '已采用修改，交付前会重新质检。' : '已采用修改。若需要将新 Logo / 产品设计应用到配套包装，可点击“同步整套设计”。'); }} />}
      <div className="studio-sync"><p>Logo 或瓶身有变化？保留当前瓶型，将当前 Logo 和文案应用到瓶身与外包装。</p><button disabled={locked || !!studio.edit} onClick={() => generate(true)}>同步整套设计</button></div>
      <section className="studio-copy"><div><h3>配套包装文案</h3><Link href="/workflow/3">编辑全部文案 ↗</Link></div><div className="studio-copy-fields">{ctx.copyProject.finalPackage?.fields.map(f => <article key={f.key}><small>{f.label}</small><p>{f.content || '资料未提供'}</p></article>)}</div></section>
      <section className="studio-versions"><h3>版本记录 <small>点击可恢复，历史会继续保留</small></h3><div>{studio.versions.filter(v => v.kind === kind).slice().reverse().map((v, i) => <button key={v.id} disabled={!!busy || v.imageUrl === activeAsset?.url} onClick={() => ctx.adoptStudioImage(brief.projectId, kind, v.imageUrl, `恢复版本：${v.instruction}`)}><img src={v.imageUrl} alt={`${assetNames[kind]}历史版本`} /><span>{v.imageUrl === activeAsset?.url ? '当前使用' : `版本 ${studio.versions.filter(v => v.kind === kind).length - i}`}</span><small>{v.instruction}</small></button>)}</div></section>
    </>}
    {!ready && !busy && <div className="studio-empty-flow"><span>01 上传资料</span><i>→</i><span>02 AI 生成整套方案</span><i>→</i><span>03 点选局部精修</span><i>→</i><span>04 质检与交付</span></div>}
  </div>;
}
