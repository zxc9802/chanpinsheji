import { getProviderOverrides, recordAiUsage, type AiUsageRecord } from "./ai-usage";

type AiResponse<T> = { data: T; usage?: { tokens?: number; images?: number; provider: string; durationMs: number } };
type ApiPayload<T> = T & { error?: string };
type ImageJobStart = { jobId?: string; status?: string };
type ImageJobPoll<T> = { status?: "queued" | "running" | "completed" | "failed"; result?: AiResponse<T>; error?: string };

function apiError(response:Response,raw:string){const detail=raw.replace(/\s+/g," ").trim().slice(0,300);return new Error(`AI 服务返回 HTTP ${response.status}${detail?`：${detail}`:""}`);}

async function readPayload<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try { return JSON.parse(raw) as T; }
  catch { throw apiError(response, raw); }
}

function responseError(response: Response, error?: string) {
  return new Error(error || `AI 服务返回 ${response.status}`);
}

async function startImageJob(body: unknown) {
  const response = await fetch("/api/ai/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await readPayload<ApiPayload<ImageJobStart>>(response);
  if (!response.ok || response.status !== 202) throw responseError(response, payload.error);
  if (!payload.jobId) throw new Error("图像任务创建失败：服务未返回任务 ID");
  return payload.jobId;
}

const IMAGE_JOB_POLL_MS = 1500;
const IMAGE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

async function pollImageJob<T>(jobId: string): Promise<AiResponse<T>> {
  const deadline = Date.now() + IMAGE_JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/ai/image?jobId=${encodeURIComponent(jobId)}`);
    const payload = await readPayload<ApiPayload<ImageJobPoll<T>>>(response);
    if (!response.ok) throw responseError(response, payload.error);
    if (payload.status === "completed") {
      if (!payload.result) throw new Error("图像任务完成但未返回结果");
      return payload.result;
    }
    if (payload.status === "failed") throw new Error(payload.error || "图像任务生成失败");
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(IMAGE_JOB_POLL_MS, deadline - Date.now())));
  }
  throw new Error("图像任务等待超时，请稍后重试");
}

let defaults: { copy: "deepseek" | "gemini"; image: "doubao" | "yunwu" } | undefined;
export async function getAiProvider(type: "copy" | "image") {
  const override = getProviderOverrides()[type];
  if (override) return override;
  if (!defaults) {
    try { const response = await fetch("/api/ai/status"); defaults = (await response.json()).defaults; }
    catch { throw new Error("无法读取 AI 服务配置，请检查本地服务是否正常运行"); }
  }
  return defaults![type];
}
export async function callAi<T>(generator: AiUsageRecord["generator"], path: "copy" | "image", body: unknown): Promise<T> {
  const started = Date.now();
  const selectedProvider = path === "image" ? await getAiProvider("image") : undefined;
  const requestBody = selectedProvider && typeof body === "object" && body !== null ? { ...body, provider: selectedProvider } : body;
  try {
    let payload: ApiPayload<AiResponse<T>>;
    if (path === "image") {
      payload = await pollImageJob<T>(await startImageJob(requestBody));
    } else {
      const response = await fetch(`/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      payload = await readPayload<ApiPayload<AiResponse<T>>>(response);
      if (!response.ok) throw responseError(response, payload.error);
    }
    recordAiUsage({ generator, provider: payload.usage?.provider || path, tokens: payload.usage?.tokens, images: payload.usage?.images, durationMs: payload.usage?.durationMs || Date.now() - started, success: true });
    return payload.data;
  } catch (error) {
    recordAiUsage({ generator, provider: selectedProvider || path, durationMs: Date.now() - started, success: false, error: error instanceof Error ? error.message : "未知错误" });
    throw error;
  }
}
export const aiErrorMessage=(error:unknown)=>error instanceof Error?error.message:"AI 服务返回了未知错误";
