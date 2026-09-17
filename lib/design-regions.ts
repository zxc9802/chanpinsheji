import type { DesignRegion, Point } from "../types/studio.ts";

const kinds = new Set(["text", "logo", "bottle", "packaging", "decoration"]);
export function parseDesignRegions(raw: unknown): DesignRegion[] {
  const items = (raw as { regions?: unknown[] })?.regions;
  if (!Array.isArray(items)) throw new Error("区域识别未返回有效结果，请重新识别或手动框选");
  return items.slice(0, 60).flatMap((value, index) => {
    const r = value as Record<string, unknown>;
    if (!r || !kinds.has(String(r.kind)) || !Array.isArray(r.polygon)) return [];
    const polygon: Point[] = r.polygon.slice(0, 48).flatMap(p => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)) return [];
      return [[p[0], p[1]] as Point];
    });
    if (polygon.length !== r.polygon.length || polygon.length < 3 || polygonArea(polygon) < 4) return [];
    return [{ id: `region-${index}`, kind: r.kind as DesignRegion["kind"], label: String(r.label || r.kind).slice(0, 80), text: typeof r.text === "string" ? r.text.slice(0, 2000) : undefined, polygon, confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)), source: "vision" as const }];
  });
}
export function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
}
export function containsPoint(polygon: Point[], point: Point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function regionAtPoint(regions: DesignRegion[], point: Point) {
  return regions.filter(r => containsPoint(r.polygon, point)).sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon))[0];
}
export function rectangleRegion(a: Point, b: Point): DesignRegion | undefined {
  const x = Math.max(0, Math.min(a[0], b[0])), y = Math.max(0, Math.min(a[1], b[1]));
  const right = Math.min(1000, Math.max(a[0], b[0])), bottom = Math.min(1000, Math.max(a[1], b[1]));
  if (right - x < 3 || bottom - y < 3) return;
  return { id: `manual-${Date.now()}`, kind: "decoration", label: "手动选区", polygon: [[x, y], [right, y], [right, bottom], [x, bottom]], confidence: 1, source: "manual" };
}
export function buildRegionEditPrompt(args: { region?: DesignRegion; instruction?: string; replacementText?: string; brandName: string; productName: string }) {
  const { region } = args;
  const replacement = args.replacementText?.trim();
  const direction = args.instruction?.trim() || (region?.kind === "text" ? "保留文字的事实和含义，提出一版更清晰简洁的排版与表达，不添加新功效或数值。" : "提供一个新的、有明显差异但符合当前品牌的设计方向。");
  return [
    region ? `仅编辑蒙版透明选区：${region.label}（${region.kind}）。图中其他位置必须完全保持不变。` : "调整整张设计图，保持产品身份和已经确认的器型。",
    replacement ? `选中文字必须准确替换为以下内容，不增删任何字：${JSON.stringify(replacement)}` : region?.text ? `当前文字：${JSON.stringify(region.text)}` : "",
    `品牌：${args.brandName}；产品：${args.productName}。除非本次明确替换，否则品牌名、规格、成分、功效事实必须保持原样。不能编造。`,
    direction,
    "第一张图是待编辑原图，保持透视、光照、材质和选区边缘衔接自然。不输出选框、蒙版、标注或说明。",
  ].filter(Boolean).join("\n");
}
