export type AiUsageRecord = {
  id: string;
  generator: "brief" | "copy" | "structure" | "logo" | "product" | "packaging" | "marketing";
  provider: string;
  tokens?: number;
  images?: number;
  durationMs: number;
  success: boolean;
  fallback?: boolean;
  error?: string;
  createdAt: string;
};

const USAGE_KEY = "packaging-agent:ai-usage";
const OVERRIDE_KEY = "packaging-agent:ai-provider-overrides";
export const getAiUsage = (): AiUsageRecord[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || "[]") as AiUsageRecord[]; } catch { return []; }
};
export const recordAiUsage = (record: Omit<AiUsageRecord, "id" | "createdAt">) => {
  if (typeof window === "undefined") return;
  const next = [{ ...record, id: `usage-${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString() }, ...getAiUsage()].slice(0, 300);
  localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ai-usage-updated"));
};
export const getUsageCount = (generator: AiUsageRecord["generator"]) => getAiUsage().filter((item) => item.generator === generator).length;
export const getProviderOverrides = (): { copy?: "deepseek" | "gemini"; image?: "doubao" | "yunwu" } => {
  if (typeof window === "undefined") return {};
  try {
    const parsed=JSON.parse(localStorage.getItem(OVERRIDE_KEY)||"{}") as {copy?:string;image?:string};
    return {...(["deepseek","gemini"].includes(parsed.copy||"")?{copy:parsed.copy as "deepseek"|"gemini"}:{}),...(["doubao","yunwu"].includes(parsed.image||"")?{image:parsed.image as "doubao"|"yunwu"}:{})};
  } catch { return {}; }
};
export const setProviderOverride = (type: "copy" | "image", value: string) => {
  const current = getProviderOverrides();
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ ...current, [type]: value }));
  window.dispatchEvent(new CustomEvent("ai-provider-updated"));
};
export const emitAiNotice = (message: string, tone: "warning" | "success" = "warning") => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ai-provider-notice", { detail: { message, tone } }));
};
