import { getProviderOverrides, recordAiUsage, type AiUsageRecord } from "./ai-usage";

type AiResponse<T> = { data: T; usage?: { tokens?: number; images?: number; provider: string; durationMs: number } };
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
    const response = await fetch(`/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    const payload = await response.json() as AiResponse<T> & { error?: string };
    if (!response.ok) throw new Error(payload.error || `AI 服务返回 ${response.status}`);
    recordAiUsage({ generator, provider: payload.usage?.provider || path, tokens: payload.usage?.tokens, images: payload.usage?.images, durationMs: payload.usage?.durationMs || Date.now() - started, success: true });
    return payload.data;
  } catch (error) {
    recordAiUsage({ generator, provider: selectedProvider || path, durationMs: Date.now() - started, success: false, error: error instanceof Error ? error.message : "未知错误" });
    throw error;
  }
}
export const aiErrorMessage=(error:unknown)=>error instanceof Error?error.message:"AI 服务返回了未知错误";
