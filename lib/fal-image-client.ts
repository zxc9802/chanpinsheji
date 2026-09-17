import { reserveMainAppCredits } from "./main-app-billing.ts";

type FalPayload = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  status?: string;
  error?: string | { message?: string };
  detail?: string | { msg?: string }[];
  images?: { url?: string }[];
};

export async function fetchFalImage(args: {
  apiKey: string;
  prompt: string;
  referenceImages?: string[];
  size?: string;
  maskImage?: string;
  billingUserId?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}) {
  if (!args.apiKey) throw new Error("fal.ai 图像密钥未配置");
  const started = Date.now();
  const deadline = started + (args.timeoutMs ?? 360_000);
  const references = args.referenceImages || [];
  if (args.maskImage && !references.length) throw new Error("局部编辑缺少原图");
  const model = `openai/gpt-image-2.5/sunburst/${references.length ? "edit" : "text-to-image"}`;
  const billing = await reserveMainAppCredits({
    userId: args.billingUserId,
    operation: references.length ? "image-edit" : "image",
    providerId: "fal",
    model,
    media: true,
  });
  let requestId = "";

  async function request(url: string, init: RequestInit = {}): Promise<FalPayload> {
    const target = new URL(url);
    if (target.origin !== "https://queue.fal.run" || target.username || target.password) {
      throw new Error("fal.ai 返回了无效的任务地址");
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("fal.ai 图像生成超时");
    const response = await fetch(target, {
      ...init,
      headers: { Authorization: `Key ${args.apiKey}`, "Content-Type": "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(30_000, remaining)),
    });
    const payload = await response.json().catch(() => ({})) as FalPayload;
    if (!response.ok || payload.error) {
      const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
      const validation = Array.isArray(payload.detail) ? payload.detail.map(item => item.msg).filter(Boolean).join("; ") : payload.detail;
      throw new Error(`fal.ai HTTP ${response.status}: ${detail || validation || response.statusText}`);
    }
    return payload;
  }

  try {
    const dimensions = args.size?.match(/^(\d+)x(\d+)$/);
    const queued = await request(`https://queue.fal.run/${model}`, {
      method: "POST",
      body: JSON.stringify({
        prompt: args.prompt,
        quality: "high",
        num_images: 1,
        output_format: "png",
        image_size: dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : args.size === "2K" ? { width: 2048, height: 2048 } : "auto",
        ...(references.length ? { image_urls: references } : {}),
        ...(args.maskImage ? { mask_url: args.maskImage } : {}),
      }),
    });
    requestId = queued.request_id || "";
    if (!requestId || !queued.status_url || !queued.response_url) throw new Error("fal.ai 未返回有效的生成任务");
    while (true) {
      const status = await request(queued.status_url);
      if (status.status === "COMPLETED") break;
      if (!["IN_QUEUE", "IN_PROGRESS"].includes(status.status || "")) throw new Error(`fal.ai 任务失败：${status.status || "未知状态"}`);
      await new Promise(resolve => setTimeout(resolve, Math.min(args.pollIntervalMs ?? 1500, Math.max(0, deadline - Date.now()))));
    }
    const result = await request(queued.response_url);
    const url = result.images?.find(item => typeof item.url === "string" && item.url.startsWith("https://"))?.url;
    if (!url) throw new Error("fal.ai 任务完成但未返回图片");
    await billing.settleMedia();
    return {
      data: { data: [{ url }] },
      usage: { provider: "fal", durationMs: Date.now() - started, images: 1 },
    };
  } catch (error) {
    await billing.release();
    const message = error instanceof Error ? error.name === "TimeoutError" ? "fal.ai 图像生成超时" : error.message : String(error);
    throw new Error(`${message.split(args.apiKey).join("[redacted]")}${requestId ? ` (fal request ${requestId})` : ""}`);
  }
}
