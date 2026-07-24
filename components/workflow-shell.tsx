"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BoxIcon, CheckIcon } from "./icons";
import { useDesignBrief } from "./design-brief-provider";

export const steps = [
  "品牌与产品", "Logo设计", "内容规划", "产品图设计", "外包装设计", "质检与交付",
];

const sideItems = [
  { icon: "▦", label: "项目" }, { icon: "◇", label: "品牌资产库" },
  { icon: "▤", label: "模板" }, { icon: "⇧", label: "导出" },
];

const stepValues = [
  "建立清晰、可执行的品牌与产品定位，为后续所有包装决策提供统一依据。",
  "形成与品牌定位一致的 Logo 视觉方向。",
  "规划包装各展示面的信息层级与内容。",
  "明确产品主视觉与电商图片表达。",
  "完成外包装的视觉与结构设计。",
  "完成规范检查并整理交付文件。",
];

export function WorkflowShell({ currentStep, children }: { currentStep: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { brief, completedSteps, hydrated, storageError, brandAssets, delivery, projects, activeProjectId, createProject, switchProject } = useDesignBrief();
  const completedCount = completedSteps.filter((step) => step >= 1 && step <= 6).length;
  const progress = Math.round((completedCount / 6) * 100);
  const [aiNotice,setAiNotice]=useState<{message:string;tone:string}|null>(null);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [projectBusy,setProjectBusy]=useState(false);
  useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent<{message:string;tone:string}>).detail;setAiNotice(detail);window.setTimeout(()=>setAiNotice(null),5000)};window.addEventListener("ai-provider-notice",listener);return()=>window.removeEventListener("ai-provider-notice",listener)},[]);
  const canVisit = (step: number) => step === 1 || step === currentStep || completedSteps.includes(step) || completedSteps.includes(step - 1);
  const startProject = async () => {
    if (projectBusy || !window.confirm("新建项目会保留当前项目，并将它加入历史项目。确认新建吗？")) return;
    setProjectBusy(true);
    try { await createProject(); setHistoryOpen(false); router.push("/workflow/1"); }
    catch (error) { window.alert(`新建项目失败：${error instanceof Error ? error.message : "浏览器存储不可用"}`); }
    finally { setProjectBusy(false); }
  };
  const continueProject = async (projectId: string) => {
    if (projectBusy || projectId === activeProjectId) { setHistoryOpen(false); return; }
    setProjectBusy(true);
    try { await switchProject(projectId); setHistoryOpen(false); router.push("/workflow/1"); }
    catch (error) { window.alert(`打开历史项目失败：${error instanceof Error ? error.message : "项目数据不可用"}`); }
    finally { setProjectBusy(false); }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><BoxIcon /><span>PackPilot</span></div>
        <div className="workspace-label">工作空间</div>
        <nav className="side-nav" aria-label="主导航">
          {sideItems.map(({ icon, label }, index) => {
            if (index === 0) return <Link className="side-link active" href={`/workflow/${currentStep}`} key={label}><span aria-hidden="true">{icon}</span>{label}{delivery.projectCompleted&&<em>已完成</em>}</Link>;
            if (index === 1 && brandAssets.length > 0) return <Link className="side-link" href="/brand-assets" key={label}><span aria-hidden="true">{icon}</span>{label}<em>{brandAssets.length}</em></Link>;
            if (index === 2) return <Link className="side-link" href="/templates" key={label}><span aria-hidden="true">{icon}</span>{label}{delivery.templates.length>0&&<em>{delivery.templates.length}</em>}</Link>;
            if (index === 3) return <Link className="side-link" href="/exports" key={label}><span aria-hidden="true">{icon}</span>{label}{delivery.exportRecords.length>0&&<em>{delivery.exportRecords.length}</em>}</Link>;
            return <button disabled key={label} title="功能开发中"><span aria-hidden="true">{icon}</span>{label}<em>即将推出</em></button>;
          })}
        </nav>
        <div className="sidebar-foot"><span className="avatar">P</span><div><strong>包装设计智能体</strong><small>模块 B · 工作台</small></div></div>
      </aside>

      <main className="main-area">
        {storageError&&<div className="global-ai-notice warning storage-notice">{storageError}</div>}
        {aiNotice&&<div className={`global-ai-notice ${aiNotice.tone}`}>{aiNotice.message}<button onClick={()=>setAiNotice(null)}>×</button></div>}
        <header className="topbar">
          <div><span className="crumb">项目</span><span className="slash">/</span><strong>{brief.product.name || "未命名包装项目"}</strong></div>
        </header>

        <div className="stepper-wrap">
          <nav className="stepper" aria-label="设计流程">
            {steps.map((label, index) => {
              const step = index + 1;
              const done = completedSteps.includes(step);
              const current = currentStep === step;
              const content = <><span className="step-number">{done ? <CheckIcon /> : step}</span><span>{label}</span></>;
              return (
                <div className={`step-item ${current ? "current" : ""} ${done ? "done" : ""}`} key={label}>
                  {canVisit(step) ? <Link href={`/workflow/${step}`} aria-current={current ? "step" : undefined}>{content}</Link> : <span className="step-locked">{content}</span>}
                  {step < 6 && <i className="step-line" />}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="content-layout">
          <section className="content-column" key={pathname}>{children}</section>
          <aside className="right-panel">
            <div className="project-side-actions">
              <div className="project-side-head"><span>◫</span><div><strong>项目工作台</strong><small>独立保存 · 随时继续</small></div></div>
              <div className="project-side-buttons">
                <button type="button" className="new-project-button" disabled={!hydrated || projectBusy} onClick={() => void startProject()}><span>＋</span><b>新建项目</b></button>
                <div className="project-history-wrap">
                <button type="button" className={`history-project-button ${historyOpen ? "active" : ""}`} disabled={!hydrated || projectBusy} onClick={() => setHistoryOpen((open) => !open)}><span>↺</span><b>历史项目</b><em>{projects.length}</em></button>
                {historyOpen && <div className="project-history-popover" role="dialog" aria-label="历史项目">
                  <div className="project-history-head"><div><strong>历史项目</strong><span>项目资料与流程成果分别保存</span></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭">×</button></div>
                  <div className="project-history-list">
                    {projects.map((project) => <article className={project.projectId === activeProjectId ? "current" : ""} key={project.projectId}>
                      <div className="history-project-main"><span>{project.completed ? "✓ 已完成" : `${project.completedSteps.filter((step) => step >= 1 && step <= 5).length}/6 进行中`}</span><strong>{project.name}</strong><small>{project.brandName || "品牌待填写"} · {project.productName || "产品待填写"}</small><time>{new Date(project.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
                      {project.projectId === activeProjectId ? <em>当前项目</em> : <button type="button" disabled={projectBusy} onClick={() => void continueProject(project.projectId)}>继续进入 →</button>}
                    </article>)}
                  </div>
                </div>}
                </div>
              </div>
              <span className="draft-status"><i />{hydrated ? "当前项目已安全保存" : "正在载入项目…"}</span>
            </div>
            <div className="value-card panel-card">
              <div className="card-kicker"><span>✦</span> 当前流程价值</div>
              <h3>{steps[currentStep - 1]}</h3>
              <p>{stepValues[currentStep - 1]}</p>
              <div className="value-result"><span>完成后获得</span><strong>{currentStep === 1 ? "结构化 Design Brief" : `${steps[currentStep - 1]}阶段成果`}</strong></div>
            </div>
            <div className="panel-card overview-card">
              <div className="card-heading"><h3>项目概览</h3><span>{completedCount}/6</span></div>
              <dl>
                <div><dt>品牌</dt><dd>{brief.brand.name || "待填写"}</dd></div>
                <div><dt>产品</dt><dd>{brief.product.name || "待填写"}</dd></div>
                <div><dt>品类</dt><dd>{brief.product.category || "待填写"}</dd></div>
                <div><dt>项目编号</dt><dd title={brief.projectId}>{brief.projectId}</dd></div>
              </dl>
              <div className="progress-head"><span>流程进度</span><strong>{progress}%</strong></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              {delivery.projectCompleted && <div className="overview-complete">✓ 项目已完成交付</div>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
