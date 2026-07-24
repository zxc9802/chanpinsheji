"use client";

import { useRouter } from "next/navigation";
import { steps } from "./workflow-shell";
import { useDesignBrief } from "./design-brief-provider";

export function PlaceholderStep({ step }: { step: number }) {
  const router = useRouter();
  const { brief, completedSteps } = useDesignBrief();
  return (
    <div className="placeholder-page">
      <div className="placeholder-visual"><span>{step}</span><i /><b /></div>
      <span className="eyebrow">STEP {step} / 6</span>
      <h1>{steps[step - 1]}</h1>
      <p>功能开发中</p>
      <div className="placeholder-note">
        <span>当前项目</span>
        <strong>{brief.product.name || "未命名包装项目"}</strong>
        <small>第 1 步的 Design Brief 已保留，后续功能可直接读取。</small>
      </div>
      <div className="page-actions placeholder-actions">
        <button className="secondary-button" type="button" onClick={() => router.push("/workflow/1")}>返回第 1 步</button>
        {completedSteps.includes(step - 1) && step < 6 && (
          <button className="primary-button" type="button" disabled>继续下一步 <span>→</span></button>
        )}
      </div>
    </div>
  );
}
