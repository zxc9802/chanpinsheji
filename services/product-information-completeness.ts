import type { DesignBrief } from "@/types/design-brief";
import type { ProductShapeFamily, ProductStructureKind } from "@/types/container";

type ProductStructureLike = {
  name?: string;
  description?: string;
  kind?: ProductStructureKind;
  shapeFamily?: ProductShapeFamily;
  dispensingType?: string;
};

export type ProductInformationProfileId =
  | "flexible_pack_full"
  | "carton_panels"
  | "container_label"
  | "solid_product_minimal"
  | "custom_adaptive";

export interface ProductInformationCompletenessProfile {
  id: ProductInformationProfileId;
  promptRule: string;
  reviewRule: string;
}

const cartonPattern = /盒|箱|纸盒|彩盒|外盒|礼盒|carton|box|case/i;
const devicePattern = /移动电源|耳机|音箱|设备|仪器|家电|电器|电子|充电|键盘|鼠标|手表|手机|power bank|device|electronic/i;
const flexiblePattern = /面膜|贴片|眼膜|鼻贴|足膜|单片袋|片装|袋装|软袋|小袋|补充袋|吸嘴袋|自立袋|pouch|sachet|sheet mask/i;
const liquidPattern = /精华液|乳液|面霜|乳霜|凝胶|喷雾|爽肤水|化妆水|香水|饮料|液体|膏体|油|滴管|泵瓶|真空瓶|喷雾瓶|软管|广口罐|bottle|jar|tube|pump/i;

export function resolveProductInformationCompleteness(
  brief: DesignBrief,
  structure?: ProductStructureLike,
): ProductInformationCompletenessProfile {
  const text = [
    brief.product.name,
    brief.product.category,
    brief.product.industry,
    brief.product.texture,
    structure?.name,
    structure?.description,
    structure?.dispensingType,
  ]
    .filter(Boolean)
    .join(" ");
  const kind =
    structure?.kind ||
    (flexiblePattern.test(text)
      ? "flexible_pack"
      : liquidPattern.test(text) ||
          ["bottle", "jar", "tube", "cylindrical"].includes(
            structure?.shapeFamily || "",
          )
        ? "liquid_container"
      : devicePattern.test(text)
        ? "solid_product"
        : "custom");

  if (kind === "flexible_pack" || flexiblePattern.test(text)) {
    return {
      id: "flexible_pack_full",
      promptRule:
        "这是具有完整正背印刷面的扁平软包装。正面必须形成至少三级可见信息层级：定稿 Logo、AI 自由创作的产品识别文字、至少一组辅助短信息或规格微文案。背面必须是一套完成度高的包装信息系统，包含 3–5 组长短有别的微型文字、说明性图标或规格信息，并通过网格、分组、对齐和留白组织；背面不得空白、只放 Logo、只放一行字或仅延续正面图案。所有文字内容可由 AI 自由创作，不要求复述第 3 步文案，但正背两面必须使用同一字体、图形、配色与版面秩序。",
      reviewRule:
        "扁平软包装必须有完成的正面与背面设计：正面至少三级信息层级；背面应有 3–5 组微型文字、图标或规格信息并形成清晰网格。背面空白、仅有 Logo、仅一行文字或只有图案延展均判定为信息设计不完整。",
    };
  }

  if (cartonPattern.test(text)) {
    return {
      id: "carton_panels",
      promptRule:
        "这是具有多个可印刷平面的盒体或箱体。主展示面必须有清晰品牌焦点、产品识别和辅助信息层级；背面或侧面应在真实可印刷区域形成 2–5 组信息、图标、规格或识别符号。各面共享同一网格和视觉系统，但不能把全部文字机械复制到每一面，也不能让主要信息面完全空白。",
      reviewRule:
        "盒体应形成主展示面与辅助信息面的明确分工；至少一个辅助面需要有成组信息或图标，且各面设计语言一致。主要可印刷面完全空白或重复同一版面判定为不完整。",
    };
  }

  if (kind === "liquid_container") {
    return {
      id: "container_label",
      promptRule:
        "这是瓶、罐、软管或圆柱容器。根据信息承载面积自动采用正标、背标、环绕标签或直接印刷：正面保留清晰品牌识别和产品层级；背面、侧面或底部只在真实可印刷区域安排 2–4 组紧凑微文案、图标或规格信息。曲面和小面积结构允许克制留白，不得为了填满而堆字，也不得让明显存在的背标区域完全空白。",
      reviewRule:
        "容器类按真实标签面积判断完整度：正标需有品牌与产品层级；存在背标或大面积可印刷区域时应有 2–4 组辅助信息。小曲面可以简洁，不因文字少而误判，但明显空白的背标区域判定为不完整。",
    };
  }

  if (kind === "solid_product" || devicePattern.test(text)) {
    return {
      id: "solid_product_minimal",
      promptRule:
        "这是实体成品而非传统包装标签。产品本体应保持工业设计所需的克制信息密度，只在合理位置使用定稿 Logo、型号或规格微文案、接口/按键/安全图标等必要标识；不得套用成分表、功效说明或大段包装背标。完整度主要由器形、功能结构、CMF、图形细节与必要标识共同构成，机身大面积留白可以是合理设计。",
      reviewRule:
        "实体成品不要求传统包装背标或高文字密度。检查 Logo、型号/规格、接口或功能标识是否与产品结构协调，以及器形、CMF 和功能细节是否完整；不得因机身文字少而判定不完整。",
    };
  }

  return {
    id: "custom_adaptive",
    promptRule:
      "这是自定义结构。先根据器型参考判断真实可见面、可印刷区域和功能结构，再决定信息密度：至少形成一个完整的主识别面；只有确实存在辅助信息面时才安排成组微文案或图标。不得在不可印刷的窄侧面、封口、按键、开口或功能区域强塞文字，也不得让明显的大面积标签区无设计。",
    reviewRule:
      "自定义结构应按参考图中的真实可印刷区域判断：主识别面必须完整；存在大面积辅助标签区时应有合理信息组织；无可用背面或侧面时不强制增加文字。",
  };
}
