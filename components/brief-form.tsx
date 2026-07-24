"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { exampleDesignBrief } from "@/lib/example-design-brief";
import type { DesignBrief } from "@/types/design-brief";
import { useDesignBrief } from "./design-brief-provider";
import { TagInput } from "./tag-input";
import { importBriefFromDocument } from "@/services/document-brief-importer";

const industries = ["美妆护肤", "食品饮料", "健康保健", "家居日化", "宠物用品", "消费电子", "其他"];
const categories = ["精华液", "面霜", "面膜", "洁面", "香水", "饮料", "食品", "其他"];
const markets = ["中国大陆一二线城市", "中国大陆下沉市场", "港澳台", "东南亚", "北美", "欧洲", "全球市场"];
const channels = ["天猫 / 抖音 / 品牌官网", "线下零售", "商超渠道", "专业渠道", "跨境电商", "全渠道"];
const ages = ["18–24 岁", "25–35 岁", "36–45 岁", "46–60 岁", "全年龄段"];
const includeCurrent = (options: string[], current: string) => current && !options.includes(current) ? [current, ...options] : options;

type FieldErrors = Record<string, string>;

function Field({ label, required, count, error, children, wide = false }: {
  label: string; required?: boolean; count?: string; error?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "wide" : ""} ${error ? "has-error" : ""}`}>
      <span className="field-label"><span>{label}{required && <b> *</b>}</span>{count && <em>{count}</em>}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

function CreatableSelect({ value, onChange, options, placeholder = "请选择或直接输入" }: {
  value: string; onChange: (value: string) => void; options: string[]; placeholder?: string;
}) {
  const listId = useId();
  return (
    <div className="creatable-select">
      <input
        className="creatable-input"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>{options.map((item) => <option value={item} key={item} />)}</datalist>
      <span aria-hidden="true">⌄</span>
    </div>
  );
}

export function BriefForm() {
  const router = useRouter();
  const { brief, setBrief, importBrief, completeStep, hydrated, delivery, applyTemplate } = useDesignBrief();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  const update = (next: DesignBrief) => { setBrief(next); setSaved(false); };
  const brand = (key: keyof DesignBrief["brand"], value: string | string[]) => update({ ...brief, brand: { ...brief.brand, [key]: value } });
  const product = (key: keyof DesignBrief["product"], value: string | string[] | DesignBrief["product"]["coreSellingPoints"]) => update({ ...brief, product: { ...brief.product, [key]: value } });
  const consumer = (key: keyof DesignBrief["consumer"], value: string | string[]) => update({ ...brief, consumer: { ...brief.consumer, [key]: value } });

  const validate = () => {
    const required: [string, string][] = [
      ["brand.name", brief.brand.name], ["product.name", brief.product.name], ["product.industry", brief.product.industry],
      ["product.category", brief.product.category], ["product.targetMarket", brief.product.targetMarket],
      ["product.salesChannel", brief.product.salesChannel], ["consumer.ageRange", brief.consumer.ageRange],
      ["brand.positioning", brief.brand.positioning],
    ];
    const next = Object.fromEntries(required.filter(([, value]) => !value.trim()).map(([key]) => [key, "请填写此项"]));
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const nextStep = () => {
    if (!validate()) {
      requestAnimationFrame(() => document.querySelector(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    completeStep(1);
    router.push("/workflow/2");
  };

  const doImport = () => {
    setImportError("");
    try {
      importBrief(importText);
      setImportNotice("已从 JSON 填写 Design Brief，所有字段仍可修改。 ");
      setImportOpen(false);
      setImportText("");
      setErrors({});
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败，请检查数据。 ");
    }
  };

  const importFile = async (file?: File) => {
    if (!file || importing) return;
    setImportError(""); setImporting(true);
    try {
      const extension=file.name.split(".").pop()?.toLowerCase();
      if(extension==="json"){
        importBrief(await file.text());
        setImportNotice(`已从 ${file.name} 填写 Design Brief。`);
      }else if(extension==="docx"||extension==="pdf"){
        const result=await importBriefFromDocument(file,brief.projectId||`project-${Date.now()}`);
        importBrief(result.brief);
        setImportNotice(`已从 ${file.name} 识别并填写表单${result.truncated?"；文档较长，仅分析了前 60000 个字符":""}。`);
      }else if(extension==="doc"){
        throw new Error("暂不支持旧版 .doc，请在 Word 中另存为 .docx 后导入");
      }else{
        throw new Error("仅支持 .docx、.pdf 或 .json 文件");
      }
      setErrors({});setImportOpen(false);setImportText("");
    }catch(error){setImportError(error instanceof Error?error.message:"文档导入失败");}
    finally{setImporting(false);if(fileInputRef.current)fileInputRef.current.value="";}
  };

  if (!hydrated) return <div className="form-loading"><span /><p>正在载入项目数据…</p></div>;

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">STEP 1 / 6</span><h1>品牌与产品定位</h1><p>梳理品牌、产品与消费者信息，为整套包装设计建立清晰的创意基准。</p></div>
        <button className="import-button" type="button" onClick={() => {setImportOpen(true);setImportError("");}}><span>↓</span> 导入 Word / PDF</button>
      </div>

      {importNotice&&<div className="document-import-notice"><span>✓</span><p>{importNotice}</p><button type="button" onClick={()=>setImportNotice("")} aria-label="关闭提示">×</button></div>}

      {delivery.templates.length > 0 && <section className="brief-template-bar"><div><span>▤</span><div><strong>从已保存模板快速开始</strong><p>自动带入风格方向、盒型偏好与配色参考，所有字段仍可修改。</p></div></div><select value={delivery.activeTemplateId || ""} onChange={(event) => applyTemplate(event.target.value)}><option value="">选择项目模板</option>{delivery.templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select><a href="/templates">管理模板 →</a></section>}

      <form onSubmit={(event) => { event.preventDefault(); nextStep(); }} noValidate>
        <section className="form-card">
          <div className="section-title"><span>01</span><div><h2>基础信息</h2><p>定义本次包装项目的基本商业背景</p></div></div>
          <div className="form-grid">
            <Field label="品牌名称" required count={`${brief.brand.name.length}/50`} error={errors["brand.name"]}><input maxLength={50} value={brief.brand.name} onChange={(e) => brand("name", e.target.value)} placeholder="请输入品牌名称" /></Field>
            <Field label="产品名称" required count={`${brief.product.name.length}/50`} error={errors["product.name"]}><input maxLength={50} value={brief.product.name} onChange={(e) => product("name", e.target.value)} placeholder="请输入产品名称" /></Field>
            <Field label="所属行业" required error={errors["product.industry"]}><CreatableSelect value={brief.product.industry} onChange={(v) => product("industry", v)} options={includeCurrent(industries, brief.product.industry)} /></Field>
            <Field label="产品品类" required error={errors["product.category"]}><CreatableSelect value={brief.product.category} onChange={(v) => product("category", v)} options={includeCurrent(categories, brief.product.category)} /></Field>
            <Field label="目标市场" required error={errors["product.targetMarket"]}><CreatableSelect value={brief.product.targetMarket} onChange={(v) => product("targetMarket", v)} options={includeCurrent(markets, brief.product.targetMarket)} /></Field>
            <Field label="销售渠道" required error={errors["product.salesChannel"]}><CreatableSelect value={brief.product.salesChannel} onChange={(v) => product("salesChannel", v)} options={includeCurrent(channels, brief.product.salesChannel)} /></Field>
            <Field label="价格带" count={`${brief.product.priceBand.length}/30`}><input maxLength={30} value={brief.product.priceBand} onChange={(e) => product("priceBand", e.target.value)} placeholder="如 ¥199–299" /></Field>
          </div>
        </section>

        <section className="form-card">
          <div className="section-title"><span>02</span><div><h2>目标消费者</h2><p>明确包装需要打动的核心人群</p></div></div>
          <div className="form-grid">
            <Field label="年龄范围" required error={errors["consumer.ageRange"]}><CreatableSelect value={brief.consumer.ageRange} onChange={(v) => consumer("ageRange", v)} options={includeCurrent(ages, brief.consumer.ageRange)} /></Field>
            <div />
            <Field label="消费关键词" wide><TagInput value={brief.consumer.keywords} onChange={(v) => consumer("keywords", v)} placeholder="如 保湿、焕亮、敏感肌可用" /></Field>
          </div>
        </section>

        <section className="form-card">
          <div className="section-title"><span>03</span><div><h2>品牌市场定位</h2><p>把品牌策略转化为可感知的性格与表达</p></div></div>
          <div className="form-grid">
            <Field label="品牌定位" required wide count={`${brief.brand.positioning.length}/100`} error={errors["brand.positioning"]}><textarea maxLength={100} rows={3} value={brief.brand.positioning} onChange={(e) => brand("positioning", e.target.value)} placeholder="如：专研天然植萃科技的高效护肤品牌" /></Field>
            <Field label="品牌个性" wide><TagInput value={brief.brand.personality} onChange={(v) => brand("personality", v)} placeholder="如 专业、温和、高效" /></Field>
            <Field label="品牌主张" count={`${brief.brand.slogan.length}/50`}><input maxLength={50} value={brief.brand.slogan} onChange={(e) => brand("slogan", e.target.value)} placeholder="一句话品牌主张" /></Field>
            <Field label="核心价值" count={`${brief.brand.coreValues.length}/100`}><textarea maxLength={100} rows={2} value={brief.brand.coreValues} onChange={(e) => brand("coreValues", e.target.value)} placeholder="品牌坚持的核心价值" /></Field>
          </div>
        </section>

        <section className="form-card">
          <div className="section-title"><span>04</span><div><h2>产品核心卖点</h2><p>提炼需要在包装上重点传达的产品价值</p></div></div>
          <div className="form-grid">
            <Field label="核心卖点" wide><TagInput value={brief.product.coreSellingPoints.map((item) => item.point)} onChange={(values) => product("coreSellingPoints", values.map((point) => brief.product.coreSellingPoints.find((item) => item.point === point) || { point }))} placeholder="如 72 小时长效保湿" /></Field>
            <Field label="核心功效" wide><TagInput value={brief.product.efficacy} onChange={(v) => product("efficacy", v)} placeholder="如 深层保湿、提亮肤色" /></Field>
            <Field label="关键成分" wide><TagInput value={brief.product.keyIngredients} onChange={(v) => product("keyIngredients", v)} placeholder="如 三重玻尿酸、烟酰胺" /></Field>
            <Field label="使用场景" count={`${brief.product.usageScenarios.length}/100`}><textarea maxLength={100} rows={3} value={brief.product.usageScenarios} onChange={(e) => product("usageScenarios", e.target.value)} placeholder="描述典型使用场景" /></Field>
            <Field label="产品质地" count={`${brief.product.texture.length}/80`}><textarea maxLength={80} rows={3} value={brief.product.texture} onChange={(e) => product("texture", e.target.value)} placeholder="描述产品质地与肤感" /></Field>
          </div>
        </section>

        {brief.insights.length > 0 && <div className="insight-banner"><span>↗</span><div><strong>已关联 {brief.insights.length} 条模块 A 洞察</strong><p>其中 {brief.product.coreSellingPoints.filter((item) => item.sourceInsightId).length} 个核心卖点带有机会点溯源。</p></div></div>}

        <div className="page-actions">
          <span className={saved ? "save-hint visible" : "save-hint"}>✓ 草稿已保存</span>
          <button className="secondary-button" type="button" onClick={() => { setBrief(brief); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}>保存草稿</button>
          <button className="primary-button" type="submit">下一步：Logo 设计 <span>→</span></button>
        </div>
      </form>

      {importOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportOpen(false); }}>
        <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="modal-head"><div><span className="eyebrow">DOCUMENT IMPORT</span><h2 id="import-title">从文档填写 Design Brief</h2></div><button type="button" disabled={importing} onClick={() => setImportOpen(false)} aria-label="关闭">×</button></div>
          <p>上传 Word 或 PDF，系统将提取文档内容并用当前真实文案模型填写表单。未在文档中出现的信息会保持为空。</p>
          <input ref={fileInputRef} className="file-input-hidden" type="file" accept=".docx,.doc,.pdf,.json,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event=>void importFile(event.target.files?.[0])}/>
          <button className={`document-dropzone ${importing?"loading":""}`} type="button" disabled={importing} onClick={()=>fileInputRef.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void importFile(event.dataTransfer.files?.[0]);}}>
            <span>{importing?"◌":"↥"}</span><strong>{importing?"正在读取并分析文档…":"选择文件或拖拽到这里"}</strong><small>支持 Word .docx、PDF、JSON · 最大 15MB</small>
          </button>
          <div className="json-divider"><span>或者粘贴模块 A 导出的 JSON</span></div>
          <textarea className="json-input compact" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'{\n  "projectId": "...",\n  "brand": { ... }\n}'} spellCheck={false} disabled={importing}/>
          {importError && <div className="import-error">{importError}</div>}
          <div className="modal-actions"><button type="button" className="text-button" disabled={importing} onClick={() => { setImportText(JSON.stringify(exampleDesignBrief, null, 2)); setImportError(""); }}>填入示例 JSON</button><div><button className="secondary-button" type="button" disabled={importing} onClick={() => setImportOpen(false)}>取消</button><button className="primary-button" type="button" onClick={doImport} disabled={!importText.trim()||importing}>导入 JSON</button></div></div>
        </section>
      </div>}
    </>
  );
}
