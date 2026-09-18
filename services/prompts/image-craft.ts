export type ImageCraftFamily =
  | "paper_box"
  | "glass_vessel"
  | "plastic_bottle"
  | "metal_can"
  | "squeeze_tube"
  | "flexible_pack"
  | "solid_product";

export type ImageCraftSubject = "product" | "outer_package";

export interface ImageCraftSignals {
  subject?: ImageCraftSubject;
  category?: string;
  industry?: string;
  material?: string;
  finish?: string;
  containerId?: string;
  containerName?: string;
  containerKind?: string;
  shapeFamily?: string;
  boxId?: string;
  boxName?: string;
  structureKind?: string;
}

export const imageCraftFamilyLabels: Record<ImageCraftFamily, string> = {
  paper_box: "纸盒 / 利乐 / 卡纸礼盒",
  glass_vessel: "玻璃瓶罐",
  plastic_bottle: "塑料瓶",
  metal_can: "金属罐",
  squeeze_tube: "软管",
  flexible_pack: "软袋 / 复合膜",
  solid_product: "固体成品",
};

const imageCraftBlocks: Record<ImageCraftFamily, string> = {
  paper_box:
    "商业包装摄影：卡纸或特种纸要看出纤维、压凹、专色油墨或柔版网点，盒面不要画成塑料壳。主光用大面积柔箱从斜上方打，盒面反光弱，棱线留一条窄高光，投影短而实。镜头约 50–85mm，整盒锐利，背景略收。不要冷凝水、液体飞溅或玻璃折射。",
  glass_vessel:
    "超写实商业静物：玻璃要有壁厚、折射和液面新月，瓶肩与盖口用一束冷调逆光勾边。主光从左上方柔和定向打，只点亮曲面高光，浅景深、主体锐利，质感接近物理光线下的产品渲染。不要磨砂塑料感，不要让花材或道具淹没瓶子。",
  plastic_bottle:
    "PET/PP 瓶体要看出壁厚、注塑分型和细腻塑料高光，不是玻璃色散。柔和棚拍主光加一条窄轮廓光勾瓶肩与泵头，地面有干净接触影。镜头约 50mm，整瓶清晰。不要写成香水玻璃，不要易拉罐冷凝水。",
  metal_can:
    "金属罐要有卷边、拉环和喷漆或拉丝的微凹凸。硬轮廓光勾圆柱边缘，罐身留一条克制高光带。仅冷饮或碳酸品类才加冷凝水，干货食品不要水珠。镜头约 50mm，广告棚拍，主体锐利。不要玻璃折射，不要把罐画成瓶子。",
  squeeze_tube:
    "软管要看出缎面弯曲高光和管肩折痕，金属或注塑盖有独立高光。主光从左上方定向柔光打，勾出管身弧度。微距偏商业静物，主体清晰。不要画成玻璃瓶或纸盒。",
  flexible_pack:
    "复合膜或铝箔袋要有褶皱、热封边和印刷网点，袋体可微鼓、局部贴合内容物。高调自然光，软影，材质颗粒清楚。不要豪华玻璃质感，不要把袋子画成硬盒或瓶罐。",
  solid_product:
    "按真实外壳写光影：注塑、金属、织物或涂层，接缝、按键和开孔要清楚。柔和主光加窄轮廓光把形体从背景分开，约 85mm 商业摄影，整件清晰。禁止套用瓶罐液面、冷凝水或香水道具。",
};

const imageCraftWriterHint =
  "写生图提示词时必须写清主光方向、一种可见表面工艺、一种镜头或景深；不要只写高级、质感好、精致。只使用当前包材这一条成像语言，不要串用其他包材的光影。";

function haystack(signals: ImageCraftSignals) {
  return [
    signals.category,
    signals.industry,
    signals.material,
    signals.finish,
    signals.containerId,
    signals.containerName,
    signals.containerKind,
    signals.shapeFamily,
    signals.boxId,
    signals.boxName,
    signals.structureKind,
  ]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function resolveImageCraftFamily(signals: ImageCraftSignals): ImageCraftFamily {
  const text = haystack(signals);
  const kind = (signals.containerKind || "").toLowerCase();
  const shape = (signals.shapeFamily || "").toLowerCase();
  const structure = (signals.structureKind || "").toLowerCase();
  const subject = signals.subject || "product";

  if (kind === "solid_product" || includesAny(shape, ["rectangular_device", "wearable", "rigid_body"])) {
    return "solid_product";
  }
  if (
    kind === "flexible_pack" ||
    structure === "pouch" ||
    includesAny(shape, ["pouch"]) ||
    includesAny(text, ["mask-sachet", "mask-pouch", "软袋", "自立袋", "铝箔", "复合膜", "opp", "面膜袋", "茶包"])
  ) {
    return "flexible_pack";
  }
  if (
    includesAny(text, ["易拉罐", "铝罐", "马口铁", "金属罐", "energy drink", "能量饮料", "碳酸", "苏打", "啤酒", "汽水"]) ||
    (includesAny(text, ["罐"]) && includesAny(text, ["铝", "铁", "金属"]))
  ) {
    return "metal_can";
  }
  if (subject === "outer_package") {
    if (structure === "tube" && includesAny(text, ["金属", "铝", "马口铁"])) return "metal_can";
    return "paper_box";
  }
  if (
    includesAny(shape, ["tube"]) ||
    includesAny(text, ["软管", "squeeze", "护手霜", "牙膏"])
  ) {
    return "squeeze_tube";
  }
  if (
    includesAny(text, ["玻璃", "香水", "香氛", "安瓶", "ampoule", "精油", "高硼硅"]) ||
    includesAny(signals.containerId || "", ["dropper", "ampoule", "rollon"])
  ) {
    return "glass_vessel";
  }
  if (
    structure === "folding_carton" ||
    structure === "rigid_box" ||
    structure === "drawer_box" ||
    structure === "tray" ||
    includesAny(text, ["lid-base", "drawer", "book", "tuck", "mailer", "纸盒", "礼盒", "天地盖", "抽屉盒", "飞机盒", "利乐", "卡纸", "燕麦奶", "纯牛奶", "植物奶"])
  ) {
    return "paper_box";
  }
  if (includesAny(text, ["pet", "pp", "pe", "塑料", "泵瓶", "喷雾", "真空瓶", "airless", "pump", "spray"])) {
    return "plastic_bottle";
  }
  if (includesAny(shape, ["jar"]) || includesAny(signals.containerId || "", ["jar"])) {
    return includesAny(text, ["玻璃"]) ? "glass_vessel" : "plastic_bottle";
  }
  if (includesAny(shape, ["bottle", "cylindrical"]) || kind === "liquid_container") {
    return includesAny(text, ["玻璃"]) ? "glass_vessel" : "plastic_bottle";
  }
  return subject === "outer_package" ? "paper_box" : "plastic_bottle";
}

export function buildImageCraftBlock(signals: ImageCraftSignals) {
  const family = resolveImageCraftFamily(signals);
  return `【商业成像 · ${imageCraftFamilyLabels[family]}】${imageCraftBlocks[family]} ${imageCraftWriterHint}`;
}

export const imageCraftFixtures: { name: string; signals: ImageCraftSignals; family: ImageCraftFamily }[] = [
  { name: "香水玻璃瓶", signals: { category: "香水", material: "玻璃" }, family: "glass_vessel" },
  { name: "燕麦奶外盒", signals: { subject: "outer_package", category: "燕麦奶", industry: "食品饮料" }, family: "paper_box" },
  { name: "按压泵塑料瓶", signals: { containerId: "pump", containerKind: "liquid_container", material: "PET" }, family: "plastic_bottle" },
  { name: "洁面软管", signals: { containerId: "tube", shapeFamily: "tube", category: "洁面" }, family: "squeeze_tube" },
  { name: "能量饮料罐", signals: { category: "能量饮料", material: "铝" }, family: "metal_can" },
  { name: "面膜袋", signals: { containerId: "mask-sachet", containerKind: "flexible_pack", shapeFamily: "pouch" }, family: "flexible_pack" },
  { name: "固体设备", signals: { containerKind: "solid_product", shapeFamily: "rectangular_device" }, family: "solid_product" },
  { name: "天地盖礼盒", signals: { subject: "outer_package", boxId: "lid-base", boxName: "天地盖盒" }, family: "paper_box" },
  { name: "香水外盒不走玻璃", signals: { subject: "outer_package", category: "香水", material: "玻璃" }, family: "paper_box" },
];
