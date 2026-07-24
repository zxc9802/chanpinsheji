"use client";

import JSZip from "jszip";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDesignBrief } from "@/components/design-brief-provider";
import { createProjectPdf } from "@/lib/project-pdf";
import { runQualityChecks } from "@/services/quality-checker";
import type { CopyField } from "@/types/copy";
import type { QualityCheckItem } from "@/types/delivery";
import type { FinalPackagingDesign } from "@/types/packaging";
import type { ProductDesignCandidate } from "@/types/product-design";

type ExportImage = {
  data: Blob;
  extension: "svg" | "png" | "jpg" | "webp";
};

const imageExtensionByMime: Record<string, ExportImage["extension"]> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function extensionFromUrl(url: string) {
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  if (cleanUrl.endsWith(".svg")) return "svg";
  if (cleanUrl.endsWith(".png")) return "png";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "jpg";
  if (cleanUrl.endsWith(".webp")) return "webp";
  return null;
}

async function readExportImage(url: string, label: string): Promise<ExportImage> {
  if (!url) throw new Error(`${label}缺少图片文件`);

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    response = await fetch("/api/ai/image-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(`${label}读取失败：${detail?.error || `HTTP ${response.status}`}`);
  }

  const blob = await response.blob();
  const mime = blob.type.split(";")[0].toLowerCase();
  const extension = imageExtensionByMime[mime] ?? extensionFromUrl(url);
  if (!extension) {
    throw new Error(`${label}格式无法识别，仅支持 SVG、PNG、JPEG、WEBP`);
  }
  return { data: blob, extension };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeName(value: string) {
  return (value || "包装设计项目").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

function list(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- 未填写";
}

function buildBriefMarkdown(
  brief: ReturnType<typeof useDesignBrief>["brief"],
  product: ProductDesignCandidate,
  packaging: FinalPackagingDesign,
) {
  const structure = product.containerType;
  return `# 项目简报

## 品牌与产品

- 项目编号：${brief.projectId}
- 品牌：${brief.brand.name || "未填写"}
- 品牌定位：${brief.brand.positioning || "未填写"}
- 产品：${brief.product.name || "未填写"}
- 品类：${brief.product.category || "未填写"}
- 行业：${brief.product.industry || "未填写"}
- 目标市场：${brief.product.targetMarket || "未填写"}
- 销售渠道：${brief.product.salesChannel || "未填写"}
- 价格带：${brief.product.priceBand || "未填写"}

## 目标消费者

- 年龄范围：${brief.consumer.ageRange || "未填写"}
- 消费关键词：
${list(brief.consumer.keywords)}

## 核心卖点

${list(brief.product.coreSellingPoints.map((item) => item.point))}

## 产品形态与 CMF

- 产品形态：${structure?.name || "未填写"}
- 规格 / 尺寸：${structure?.dimensions || structure?.volume || brief.hardConstraints.dimensions || "未填写"}
- 使用或取用方式：${structure?.dispensingType || "未填写"}
- 材质：${product.cmf.material || "未填写"}
- 配色：${product.cmf.colorScheme.join("、") || "未填写"}
- 表面工艺：${product.cmf.finish || "未填写"}
- 视图模式：${product.viewMode === "two_view" ? "正背两视图" : "正侧背三视图"}

## 外包装参考与设计说明

- 参考结构：${packaging.boxType.name || "用户上传的外包装参考"}
- 参考尺寸：${packaging.boxType.referenceDimensionsLabel || "由 AI 结合参考图推导"}
- 设计说明：${packaging.candidate.directionName || "依据定稿产品方案与外包装参考图完成概念效果设计"}

> 本项目交付图片为概念设计效果图，不包含刀版、CAD 或印刷工程文件，生产前需由结构与印刷工程人员复核。
`;
}

function buildCopyMarkdown(
  fields: CopyField[],
  insights: ReturnType<typeof useDesignBrief>["brief"]["insights"],
) {
  const insightMap = new Map(insights.map((item) => [item.id, item.content]));
  const body = fields
    .map((field) => {
      const source = field.linkedInsightId
        ? `\n\n溯源：${field.linkedInsightId} — ${insightMap.get(field.linkedInsightId) || "原始洞察"}`
        : "";
      return `## ${field.label}\n\n${field.content || "未填写"}${source}`;
    })
    .join("\n\n");
  return `# 定稿文案\n\n${body}\n`;
}

function buildQualityMarkdown(report: QualityCheckItem[]) {
  const labels = { pass: "通过", warning: "警告", fail: "未通过" } as const;
  return `# 质检报告

生成时间：${new Date().toLocaleString("zh-CN")}

${report
  .map(
    (item) => `## ${labels[item.status]}｜${item.title}

${item.message}${item.details?.length ? `\n\n${item.details.map((detail) => `- ${detail}`).join("\n")}` : ""}`,
  )
  .join("\n\n")}

> 质检面向概念设计交付，不替代印刷、结构、法规及工程打样验证。
`;
}

export function DeliveryPage() {
  const router = useRouter();
  const {
    brief,
    completedSteps,
    logoProject,
    copyProject,
    productDesign,
    packagingProject,
    delivery,
    completeExport,
  } = useDesignBrief();
  const [report, setReport] = useState<QualityCheckItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");

  const logo = logoProject.candidates.find((item) => item.id === logoProject.finalLogoId);
  const finalCopy = copyProject.finalPackage;
  const product = productDesign.candidates.find((item) => item.id === productDesign.finalDesignId);
  const packaging = packagingProject.finalDesign;
  const coreReady = Boolean(logo && finalCopy && product && packaging);

  useEffect(() => {
    if (!coreReady) {
      setReport([]);
      return;
    }
    setReport(
      runQualityChecks({
        brief,
        logo: logo!,
        copy: finalCopy!,
        product: product!,
        packaging: packaging!,
      }),
    );
  }, [
    brief,
    coreReady,
    finalCopy,
    logo,
    packaging,
    product,
  ]);

  const blockingFailures = useMemo(
    () => report.filter((item) => item.status === "fail"),
    [report],
  );

  if (!completedSteps.includes(5) || !coreReady) {
    return (
      <section className="placeholder-card">
        <span className="step-kicker">STEP 6 / 6</span>
        <h1>质检与交付</h1>
        <p>请先完成并定稿 Logo、内容规划、产品概念图和外包装效果图。</p>
        <button className="primary-button" onClick={() => router.push("/workflow/5")}>
          返回外包装设计
        </button>
      </section>
    );
  }

  const handleExport = async () => {
    if (blockingFailures.length) {
      setNotice("导出失败：请先补齐 Logo、产品概念图和外包装效果图");
      return;
    }

    setExporting(true);
    setNotice("");
    try {
      const [logoFile, productFile, packagingFile] = await Promise.all([
        readExportImage(logo!.imageUrl, "定稿 Logo"),
        readExportImage(product!.imageUrl, "产品概念图"),
        readExportImage(packaging!.candidate.previewImageUrl, "外包装效果图"),
      ]);

      const [briefPdf, copyPdf, qualityPdf] = await Promise.all([
        createProjectPdf(buildBriefMarkdown(brief, product!, packaging!)),
        createProjectPdf(buildCopyMarkdown(finalCopy!.fields, brief.insights)),
        createProjectPdf(buildQualityMarkdown(report)),
      ]);
      const zip = new JSZip();
      zip.file(`01_Logo/定稿Logo.${logoFile.extension}`, logoFile.data);
      zip.file(`02_产品设计/产品概念图.${productFile.extension}`, productFile.data);
      zip.file(`03_外包装设计/外包装效果图.${packagingFile.extension}`, packagingFile.data);
      zip.file("04_项目资料/项目简报.pdf", briefPdf);
      zip.file("04_项目资料/定稿文案.pdf", copyPdf);
      zip.file("04_项目资料/质检报告.pdf", qualityPdf);

      const blob = await zip.generateAsync({ type: "blob" });
      const filename = `${safeName(brief.brand.name)}-${safeName(brief.product.name)}-交付包.zip`;
      downloadBlob(blob, filename);
      completeExport({
        id: `export-${Date.now()}`,
        projectId: brief.projectId,
        projectName: brief.product.name || brief.brand.name || "包装设计项目",
        exportedAt: new Date().toISOString(),
        fileName: filename,
        assetCount: 6,
      });
      setNotice("导出完成：交付包包含 3 项核心视觉资产和 3 份项目资料。");
    } catch (error) {
      setNotice(`导出失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
      <section className="delivery-page">
        <header className="page-title-row">
          <div>
            <span className="step-kicker">STEP 6 / 6</span>
            <h1>质检与交付</h1>
            <p>检查前五步定稿成果，确认后导出完整项目交付包。</p>
          </div>
          <span className="engine-pill">{delivery.projectCompleted ? "项目已完成 · 6/6" : "交付前检查"}</span>
        </header>

        <section className="section-card">
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>一致性与交付检查</h2>
              <p>缺少核心视觉资产时会阻止导出，其余工程提示可带警告继续交付。</p>
            </div>
          </div>
          <div className="quality-grid">
            {report.map((item) => (
              <article className={`quality-card ${item.status}`} key={item.id}>
                <strong>
                  {item.status === "pass" ? "✓" : item.status === "warning" ? "!" : "×"} {item.title}
                </strong>
                <p>{item.message}</p>
                {item.details?.map((detail) => <small key={detail}>{detail}</small>)}
                {item.returnStep ? (
                  <button onClick={() => router.push(`/workflow/${item.returnStep}`)}>返回修改</button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="section-card">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>交付内容预览</h2>
              <p>ZIP 固定包含 6 个文件，不含营销物料、提示词、刀版、CAD、成本或模板数据。</p>
            </div>
          </div>
          <div className="delivery-tree">
            <div><strong>01_Logo</strong><span>定稿Logo.[实际格式]</span></div>
            <div><strong>02_产品设计</strong><span>产品概念图.[实际格式]</span></div>
            <div><strong>03_外包装设计</strong><span>外包装效果图.[实际格式]</span></div>
            <div>
              <strong>04_项目资料</strong>
              <span>项目简报.pdf</span>
              <span>定稿文案.pdf</span>
              <span>质检报告.pdf</span>
            </div>
          </div>
          <div className="delivery-actions">
            <button
              className="primary-button"
              disabled={exporting || blockingFailures.length > 0}
              onClick={handleExport}
            >
              {exporting ? "正在整理交付包…" : "导出 ZIP"}
            </button>
          </div>
          {notice ? (
            <p className={`delivery-notice ${notice.startsWith("导出失败") ? "error" : ""}`}>{notice}</p>
          ) : null}
        </section>

        {delivery.projectCompleted ? (
          <section className="section-card completion-card">
            <span className="completion-mark">✓</span>
            <h2>项目已完成 · 6/6</h2>
            <p>三项核心视觉成果已整理，可随时从导出历史重新下载。</p>
            <div className="completion-gallery">
              <figure><img src={logo!.imageUrl} alt="定稿 Logo" /><figcaption>定稿 Logo</figcaption></figure>
              <figure><img src={product!.imageUrl} alt="产品概念图" /><figcaption>产品概念图</figcaption></figure>
              <figure><img src={packaging!.candidate.previewImageUrl} alt="外包装效果图" /><figcaption>外包装效果图</figcaption></figure>
            </div>
          </section>
        ) : null}
      </section>
  );
}
