'use client';
import { useEffect, useRef, useState } from 'react';
import type { AssetKind, DesignRegion, Point } from '@/types/studio';
import { buildRegionEditPrompt, rectangleRegion, regionAtPoint, translatePolygon } from '@/lib/design-regions';
import { loadImage, localImage, mergeRegion, prepareUpload, regionTask, selectionMask } from '@/lib/studio-images';
import { pollImageJob, startImageJob } from '@/lib/ai-client';

export type PendingEdit = { jobId: string; original: string; region?: DesignRegion; segmentedMask?: string; instruction: string; replacementText: string };
export function RegionEditor(props: {
  imageUrl: string; brandName: string; productName: string; regions: DesignRegion[];
  onRegions: (regions: DesignRegion[]) => void; onAdopt: (url: string, instruction: string) => void;
  onBusyChange?: (busy: boolean) => void;
  assetKind?: AssetKind;
  pending?: PendingEdit; onPending: (pending?: PendingEdit) => void;
}) {
  const [source, setSource] = useState(''), [regions, setRegions] = useState(props.regions);
  const [selected, setSelected] = useState<DesignRegion>(), [whole, setWhole] = useState(false), [drawing, setDrawing] = useState(false), [moving, setMoving] = useState(false);
  const selectedRef = useRef<DesignRegion | undefined>(undefined);
  selectedRef.current = selected;
  const [instruction, setInstruction] = useState(''), [replacementText, setReplacement] = useState('');
  const [reference, setReference] = useState<{ name: string; dataUrl: string }>();
  const [referenceDragging, setReferenceDragging] = useState(false);
  const referenceDragDepth = useRef(0);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState(''), [before, setBefore] = useState(false);
  const [segmentedMask, setSegmentedMask] = useState<string>(), [overlay, setOverlay] = useState('');
  useEffect(() => { props.onBusyChange?.(!!busy); return () => props.onBusyChange?.(false); }, [busy, props.onBusyChange]);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 600 });
  useEffect(() => { const el = canvasRef.current; if (!el) return; const observer = new ResizeObserver(() => { const style = getComputedStyle(el); setCanvasSize({ width: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) }); }); observer.observe(el); return () => observer.disconnect(); }, []);
  const fittedWidth = Math.min(canvasSize.width, canvasSize.height * dimensions.width / dimensions.height);
  const alive = useRef(true), drag = useRef<{ start?: Point; vertex?: number; move?: { origin: Point; region: DesignRegion; active: boolean } } | null>(null);
  useEffect(() => { alive.current = true; localImage(props.imageUrl).then(async url => { const img = await loadImage(url); if (alive.current) { setSource(url); setDimensions({ width: img.width, height: img.height }); } }).catch(e => { if (alive.current) setError(e.message); }); return () => { alive.current = false; }; }, [props.imageUrl]);
  const saveRegions = (next: DesignRegion[]) => { setRegions(next); props.onRegions(next); };
  const choose = (region?: DesignRegion) => { setSelected(region); setWhole(false); setDrawing(false); setReplacement(''); setSegmentedMask(undefined); setOverlay(''); setPreview(''); setError(''); };
  async function task(label: string, run: () => Promise<void>) { if (busy) return; setBusy(label); setError(''); try { await run(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '操作失败'); } finally { if (alive.current) setBusy(''); } }
  const recognize = () => task('正在识别文字、Logo 和物体…', async () => {
    const result = await regionTask<{ regions: DesignRegion[] }>({ action: 'detect', image: source });
    if (alive.current) { saveRegions(result.regions); if (!result.regions.length) setError('没有识别到清晰区域，可以手动框选'); }
  });
  const refine = () => task('正在精细分割边缘…', async () => {
    if (!selected) return;
    const result = await regionTask<{ maskUrl: string }>({ action: 'segment', image: source, region: selected, ...dimensions });
    const mask = await selectionMask(source, selected, result.maskUrl);
    if (alive.current) { setSegmentedMask(result.maskUrl); setOverlay(mask.overlay); }
  });
  const uploadReference = (file: File) => task('正在读取修改参考图…', async () => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('修改参考图只支持 PNG、JPG 或 WebP');
    const dataUrl = await prepareUpload(file);
    if (alive.current) setReference({ name: file.name, dataUrl });
  });
  const generate = (resume?: PendingEdit) => task(resume ? '正在查询已提交任务…' : '正在生成修改预览…', async () => {
    const base = resume?.original || source, region = resume ? resume.region : whole ? undefined : selected;
    if (!whole && !region && !resume) throw new Error('请点选区域或选择整体修改');
    const maskSource = resume ? resume.segmentedMask : segmentedMask;
    const mask = region ? await selectionMask(base, region, maskSource) : undefined;
    const editInstruction = resume?.instruction ?? instruction, replacement = resume?.replacementText ?? replacementText;
    const jobId = resume?.jobId || await startImageJob({ provider: 'fal', prompts: [buildRegionEditPrompt({ region, instruction: editInstruction, replacementText: replacement, brandName: props.brandName, productName: props.productName, assetKind: props.assetKind, hasReference: !!reference })], referenceImageGroups: [[base, ...(reference ? [reference.dataUrl] : [])]], quality: 'high', ...(mask ? { maskImage: mask.apiMask } : {}) });
    const pending = { jobId, original: base, region, segmentedMask: maskSource, instruction: editInstruction || (reference ? `参考图：${reference.name}` : ''), replacementText: replacement };
    if (alive.current) props.onPending(pending);
    const result = await pollImageJob<string[]>(jobId);
    if (!result.data[0]) throw new Error('编辑任务没有返回图片');
    const url = mask ? await mergeRegion(base, result.data[0], mask.selection) : await localImage(result.data[0]);
    if (alive.current) { setPreview(url); setBefore(false); }
  });
  function point(e: React.PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, (e.clientX - rect.left) / rect.width * 1000)), Math.max(0, Math.min(1000, (e.clientY - rect.top) / rect.height * 1000))];
  }
  const locked = !!busy || !!preview || !!props.pending;
  const selectedCorner = selected && {
    x: Math.min(Math.max(...selected.polygon.map(p => p[0])), 960),
    y: Math.min(Math.max(...selected.polygon.map(p => p[1])), 960),
  };
  const dismissSelected = () => {
    if (!selected || locked) return;
    saveRegions(regions.filter(r => r.id !== selected.id));
    choose();
  };
  const hitsClear = (p: Point) => {
    if (!selectedCorner || fittedWidth <= 0) return false;
    const height = fittedWidth * dimensions.height / dimensions.width;
    const px = p[0] / 1000 * fittedWidth, py = p[1] / 1000 * height;
    const left = selectedCorner.x / 1000 * fittedWidth, top = selectedCorner.y / 1000 * height;
    return px >= left - 8 && px <= left + 30 && py >= top - 8 && py <= top + 30;
  };
  return <div className="region-editor">
    <div className="studio-canvas-column">
      <div className="canvas-toolbar" role="toolbar" aria-label="图片编辑工具">
        <button disabled={!source || locked} onClick={recognize}>⌖ 自动识别区域</button>
        <button className={drawing ? 'active' : ''} disabled={!source || locked} onClick={() => { choose(); setDrawing(true); }}>▧ 手动框选</button>
        <button className={whole ? 'active' : ''} disabled={!source || locked} onClick={() => { choose(); setWhole(true); }}>整体修改</button>
        <span>{preview ? '修改预览' : drawing ? '在图片上拖动框选' : moving ? '拖动选框移动位置' : '点击选框后可拖动，或拖动圆点调整范围'}</span>
      </div>
      <div className="studio-canvas" ref={canvasRef}>
        {source ? <div className="region-image-wrap" style={{ width: fittedWidth, height: fittedWidth * dimensions.height / dimensions.width }}>
          <img src={preview && !before ? preview : source} alt={preview && !before ? '修改后预览' : '当前设计'} />
          {!preview && overlay && <img src={overlay} alt="精细识别的选区" className="region-mask" />}
          {!preview && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className={`region-map${drawing ? ' drawing' : ''}${moving ? ' is-moving' : ''}`} aria-label="可编辑区域画布"
            onPointerDown={e => {
              if (locked) return;
              const p = point(e);
              const vertex = (e.target as Element).getAttribute('data-vertex');
              if (vertex === null && hitsClear(p)) { e.preventDefault(); dismissSelected(); return; }
              e.currentTarget.setPointerCapture(e.pointerId);
              if (vertex !== null && selected) drag.current = { vertex: Number(vertex) };
              else if (drawing) drag.current = { start: p };
              else {
                const hit = regionAtPoint(regions, p);
                if (hit) {
                  const region = selected?.id === hit.id ? selected : hit;
                  if (selected?.id !== hit.id) choose(hit);
                  drag.current = { move: { origin: p, region, active: false } };
                } else choose();
              }
            }}
            onPointerMove={e => {
              if (!drag.current || locked) return;
              const p = point(e);
              if (drag.current.start) { setSegmentedMask(undefined); setOverlay(''); const r = rectangleRegion(drag.current.start, p); if (r) { selectedRef.current = r; setSelected(r); } }
              else if (selected && drag.current.vertex !== undefined) { setSegmentedMask(undefined); setOverlay(''); const next = { ...selected, source: 'manual' as const, polygon: selected.polygon.map((v, i) => i === drag.current?.vertex ? p : v) }; selectedRef.current = next; setSelected(next); }
              else if (drag.current.move) {
                const { origin, region } = drag.current.move;
                const dx = p[0] - origin[0], dy = p[1] - origin[1];
                if (!drag.current.move.active && dx * dx + dy * dy < 9) return;
                drag.current.move.active = true;
                const next = { ...region, source: 'manual' as const, polygon: translatePolygon(region.polygon, dx, dy) };
                selectedRef.current = next; setMoving(true); setSegmentedMask(undefined); setOverlay(''); setSelected(next);
              }
            }}
            onPointerUp={() => {
              const current = selectedRef.current;
              const movingBox = drag.current?.move;
              if (movingBox && !movingBox.active) { drag.current = null; setMoving(false); return; }
              if (drag.current && current) { saveRegions([...regions.filter(r => r.id !== current.id), current]); setDrawing(false); }
              drag.current = null; setMoving(false);
            }}
            onPointerCancel={() => { drag.current = null; setMoving(false); }}>
            {regions.filter(r => r.id !== selected?.id).map(r => <polygon key={r.id} points={r.polygon.map(p => p.join(',')).join(' ')} className="region-outline"><title>{r.label}{r.text ? `：${r.text}` : ''}</title></polygon>)}
            {selected && <><polygon points={selected.polygon.map(p => p.join(',')).join(' ')} className="region-selected" />{selected.polygon.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="7" className="region-handle" data-vertex={i} />)}</>}
          </svg>}
          {selected && selectedCorner && !preview && <button type="button" className="region-clear" style={{ left: `${selectedCorner.x / 10}%`, top: `${selectedCorner.y / 10}%` }} disabled={locked} aria-label="取消框选" title="取消框选" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); dismissSelected(); }} onClick={e => { e.preventDefault(); e.stopPropagation(); }}>×</button>}
        </div> : <div className="studio-placeholder">正在读取设计图…</div>}
      </div>
      {preview && <div className="preview-actions"><button onClick={() => setBefore(!before)}>{before ? '查看修改后' : '查看修改前'}</button><button onClick={() => { setPreview(''); props.onPending(undefined); }}>放弃这次修改</button><button className="studio-primary" onClick={() => { props.onAdopt(preview, props.pending?.replacementText ? `替换文字：${props.pending.replacementText}` : props.pending?.instruction || 'AI 自主调整'); props.onPending(undefined); }}>采用这版设计</button></div>}
    </div>
    <aside className="region-panel">
      <div className="studio-eyebrow">局部精修</div><h3>{whole ? '修改整体设计' : selected?.label || '先选中想修改的部分'}</h3>
      {!selected && !whole && <p>先自动识别，也可以手动框选。选中后拖动选框移动位置，或拖动圆点调整范围。</p>}
      {selected && <>
        <div className="region-status">{segmentedMask ? '✓ 已精细分割，请核对高亮范围' : selected.source === 'manual' ? '手动选区 · 可拖动整框或边界' : `自动识别 · 置信度 ${Math.round(selected.confidence * 100)}%`}</div>
        <label>选区类型<select disabled={locked} value={selected.kind} onChange={e => { const next = { ...selected, kind: e.target.value as DesignRegion['kind'] }; setSelected(next); saveRegions(regions.map(r => r.id === next.id ? next : r)); }}><option value="text">文字</option><option value="logo">Logo</option><option value="bottle">瓶身 / 产品</option><option value="packaging">外包装</option><option value="decoration">图案 / 其他</option></select></label>
        {selected.text && <div className="recognized-text"><small>识别文字，可与原图核对</small><p>{selected.text}</p></div>}
        {selected.kind === 'text' && <label>替换成什么文字？<textarea disabled={locked} value={replacementText} onChange={e => setReplacement(e.target.value)} placeholder="需要指定文字时填写；留空则让 AI 调整表达" /></label>}
        {['bottle', 'packaging', 'logo'].includes(selected.kind) && <button disabled={locked} onClick={refine}>精细识别边缘</button>}
      </>}
      {(selected || whole) && <><div className={`region-edit-input${referenceDragging ? ' is-dragging' : ''}`}
        onDragEnter={e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); referenceDragDepth.current++; if (!locked) setReferenceDragging(true); }}
        onDragOver={e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = locked ? 'none' : 'copy'; }}
        onDragLeave={e => { e.preventDefault(); referenceDragDepth.current = Math.max(0, referenceDragDepth.current - 1); if (!referenceDragDepth.current) setReferenceDragging(false); }}
        onDrop={e => { e.preventDefault(); referenceDragDepth.current = 0; setReferenceDragging(false); if (locked) return; const files = e.dataTransfer.files; if (!files.length) return; if (files.length !== 1) { setError('每次请上传一张修改参考图'); return; } void uploadReference(files[0]); }}>
        <label>修改想法 <small>选填</small><textarea disabled={locked} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="例如：参考上传图片的图案修改盒子，保持文字和 Logo" /></label>
        <label className="region-reference-upload"><input type="file" aria-label="上传修改参考图" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadReference(file); e.target.value = ''; }} /><strong>{referenceDragging ? '松开即可上传参考图' : reference ? '更换修改参考图' : '＋ 上传或拖入修改参考图'}</strong><small>选填 · PNG / JPG / WebP · 最大 15MB</small></label>
        {reference && <div className="region-reference-preview"><img src={reference.dataUrl} alt="修改参考图" /><span>{reference.name}</span><button disabled={locked} onClick={() => setReference(undefined)}>移除参考图</button></div>}
      </div><button className="studio-primary" disabled={locked || !source} onClick={() => generate()}>{instruction.trim() || replacementText.trim() || reference ? '按要求生成预览' : '让 AI 换一个方案'}</button><p className="studio-help">可只上传参考图，让 AI 决定修改方式。{whole ? '整张设计都会参与修改。' : '只有选区内的像素会被替换。'}修改先预览，采用后保留历史版本。文字替换后请核对字形和内容；配套文案可在下方单独编辑。</p></>}
      {busy && <div className="studio-busy" role="status"><i />{busy}</div>}
      {props.pending && !busy && !preview && <div className="studio-resume"><p>已提交编辑任务，继续查询不会重新生成。</p><button onClick={() => generate(props.pending)}>继续查询结果</button><button onClick={() => props.onPending(undefined)}>不采用该任务</button></div>}
      {error && <div className="studio-error" role="alert">{error}</div>}
      {regions.length > 0 && <div className="region-list"><small>识别到 {regions.length} 个区域</small>{regions.map(r => <button disabled={locked} className={selected?.id === r.id ? 'active' : ''} key={r.id} onClick={() => choose(r)}>{r.kind === 'text' ? '文' : '◇'} {r.label}<span>{r.text?.slice(0, 28)}</span></button>)}</div>}
    </aside>
  </div>;
}
