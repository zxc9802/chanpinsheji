import type { DesignBrief } from "@/types/design-brief";
import type { CopyPackage } from "@/types/copy";
import type { LogoCandidate } from "@/types/logo";
import type { ProductDesignCandidate } from "@/types/product-design";
import type { FinalPackagingDesign } from "@/types/packaging";
import type { QualityCheckItem } from "@/types/delivery";

const hasImage = (url?: string) =>
  Boolean(url && (/^data:image\//.test(url) || /^https?:\/\//.test(url) || url.startsWith("/")));

const display = (value?: string) => value?.trim() || "未填写";

export function runQualityChecks(args: {
  brief: DesignBrief;
  logo: LogoCandidate;
  copy: CopyPackage;
  product: ProductDesignCandidate;
  packaging: FinalPackagingDesign;
}): QualityCheckItem[] {
  const { brief, logo, copy, product, packaging } = args;
  const productReview = product.qualityReview;
  const coreAssetsReady =
    hasImage(logo.imageUrl) &&
    hasImage(product.imageUrl) &&
    hasImage(packaging.candidate.previewImageUrl);

  const missingBrief = [
    !brief.brand.name && "品牌名称",
    !brief.product.name && "产品名称",
    !brief.product.category && "产品品类",
    !brief.brand.positioning && "品牌定位",
  ].filter(Boolean) as string[];
  const missingCopy = copy.fields.filter((field) => !field.content.trim()).map((field) => field.label);

  const productSpec =
    product.containerType.dimensions ||
    product.containerType.volume ||
    brief.hardConstraints.dimensions;
  const packagingReference =
    packaging.boxType.referenceImageUrl || packaging.boxType.structureImageUrl;
  const structureWarnings = [
    !productSpec && "产品形态尚未记录明确尺寸或容量",
    !packagingReference && "外包装参考结构图不可读取",
  ].filter(Boolean) as string[];

  const visualReviewUnavailable =
    product.qualityReviewStatus === "failed" || !productReview;
  const logoIssue = Boolean(productReview && !productReview.logoConsistent);

  return [
    {
      id: "assets",
      title: "核心视觉资产",
      status: coreAssetsReady ? "pass" : "fail",
      message: coreAssetsReady
        ? "定稿 Logo、产品概念图和外包装效果图均已齐全。"
        : "三项核心视觉资产存在缺失或图片地址不可识别，暂不能导出。",
      details: [
        `定稿 Logo：${hasImage(logo.imageUrl) ? "已就绪" : "缺失"}`,
        `产品概念图：${hasImage(product.imageUrl) ? "已就绪" : "缺失"}`,
        `外包装效果图：${hasImage(packaging.candidate.previewImageUrl) ? "已就绪" : "缺失"}`,
      ],
      ...(!coreAssetsReady ? { returnStep: 4 } : {}),
    },
    {
      id: "visual",
      title: "视觉与 Logo 关联",
      status: logoIssue || visualReviewUnavailable ? "warning" : "pass",
      message: visualReviewUnavailable
        ? "视觉自动检查结果不可用，请在导出前人工核对成图中的 Logo。检查服务失败不会阻止导出。"
        : logoIssue
          ? "产品概念图中的 Logo 与定稿 Logo 存在明显偏差，建议返回产品图设计重新生成。"
          : "产品概念图已通过 Logo 一致性与品牌感检查。",
      details: productReview
        ? [
            `Logo 一致度：${productReview.logoFidelity} 分`,
            `品牌感：${productReview.brandQuality} 分`,
            ...productReview.issues.slice(0, 2),
          ]
        : [
            `定稿 Logo 风格：${logo.styleTags.join(" / ") || "已确认"}`,
            "请人工核对产品图和外包装图中的 Logo 形态。",
          ],
      ...(logoIssue ? { returnStep: 4 } : {}),
    },
    {
      id: "structure",
      title: "产品与外包装结构",
      status: structureWarnings.length ? "warning" : "pass",
      message: structureWarnings.length
        ? "结构信息不完整，生产前需要进一步工程确认。"
        : "产品形态、规格和外包装参考结构信息已记录。",
      details: structureWarnings.length
        ? structureWarnings
        : [
            `产品：${display(product.containerType.name)} · ${display(productSpec)}`,
            `外包装：${display(packaging.boxType.name)} · ${display(packaging.boxType.referenceDimensionsLabel)}`,
          ],
      ...(structureWarnings.length ? { returnStep: 5 } : {}),
    },
    {
      id: "brief",
      title: "项目资料完整性",
      status: missingBrief.length || missingCopy.length ? "warning" : "pass",
      message:
        missingBrief.length || missingCopy.length
          ? "部分项目资料未填写，允许导出，但交付文档会显示为未填写。"
          : "Design Brief 与定稿文案均已就绪。",
      details: [
        missingBrief.length
          ? `Design Brief 缺少：${missingBrief.join("、")}`
          : "Design Brief 核心字段完整",
        missingCopy.length
          ? `定稿文案缺少：${missingCopy.join("、")}`
          : `定稿文案共 ${copy.fields.length} 项`,
      ],
      ...(missingBrief.length ? { returnStep: 1 } : missingCopy.length ? { returnStep: 3 } : {}),
    },
    {
      id: "constraints",
      title: "尺寸与工程提示",
      status: "warning",
      message: "当前成果为概念设计，生产前仍需完成结构打样、法规与印刷工程验证。",
      details: [
        `产品规格：${display(productSpec)}`,
        `外包装参考：${display(packaging.boxType.referenceDimensionsLabel)}`,
        brief.hardConstraints.maxPackageCost
          ? `包装成本约束：${brief.hardConstraints.maxPackageCost}`
          : "包装成本约束：未填写",
        "交付包不包含刀版、CAD、印刷工程文件或成本明细。",
      ],
      returnStep: 5,
    },
  ];
}
