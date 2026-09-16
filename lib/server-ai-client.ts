import {
  MainAppBillingError,
  reserveMainAppCredits,
  type MainAppTokenUsage,
} from "./main-app-billing.ts";

export type ServerAiUsage = {
  provider: string;
  durationMs: number;
  tokens?: number;
  images?: number;
};

type FetchAiJsonArgs = {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  provider: string;
  generator: string;
  authHeaders?: Record<string, string>;
  billingUserId?: string;
  billingEnabled?: boolean;
};

function upstreamError(response: Response, raw: string) {
  const detail = raw.replace(/\s+/g, " ").trim().slice(0, 300);
  return new Error(`AI 上游返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function modelFrom(args: Pick<FetchAiJsonArgs, "url" | "body">) {
  const body = record(args.body);
  if (typeof body.model === "string" && body.model.trim()) return body.model.trim();
  const match = args.url.match(/\/models\/([^/:?]+):/);
  return match?.[1] ? decodeURIComponent(match[1]) : "gpt-image-2";
}

function maxOutputTokensFrom(bodyValue: unknown) {
  const body = record(bodyValue);
  const generationConfig = record(body.generationConfig);
  return positiveInteger(body.max_tokens)
    || positiveInteger(generationConfig.maxOutputTokens)
    || 8_192;
}

function estimatedInputTokens(body: unknown) {
  const raw = JSON.stringify(body, (_key, value) => (
    typeof value === "string" && value.length > 8_000
      ? `[large-input:${value.length}]`
      : value
  ));
  return Math.min(200_000, new TextEncoder().encode(raw).length);
}

function responseTextBytes(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const text = [
    ...choices.map((choice) => JSON.stringify(record(record(choice).message).content || "")),
    ...candidates.map((candidate) => JSON.stringify(record(record(candidate).content).parts || "")),
  ].join("");
  return new TextEncoder().encode(text).length;
}

function tokenUsage(payloadValue: unknown, fallbackInput: number): MainAppTokenUsage {
  const payload = record(payloadValue);
  const usage = record(payload.usage);
  const metadata = record(payload.usageMetadata);
  const inputTokens = positiveInteger(usage.prompt_tokens ?? usage.input_tokens)
    || positiveInteger(metadata.promptTokenCount)
    || fallbackInput;
  const cachedInputTokens = Math.min(
    inputTokens,
    positiveInteger(record(usage.prompt_tokens_details).cached_tokens)
      || positiveInteger(metadata.cachedContentTokenCount),
  );
  const reasoningTokens = positiveInteger(
    record(usage.completion_tokens_details).reasoning_tokens,
  ) || positiveInteger(metadata.thoughtsTokenCount);
  const outputTokens = positiveInteger(usage.completion_tokens ?? usage.output_tokens)
    || positiveInteger(metadata.candidatesTokenCount) + reasoningTokens
    || Math.max(1, responseTextBytes(payload));
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: positiveInteger(usage.total_tokens)
      || positiveInteger(metadata.totalTokenCount)
      || inputTokens + outputTokens,
  };
}

export async function fetchAiJson<T>(
  args: FetchAiJsonArgs,
): Promise<{ data: T; usage: ServerAiUsage }> {
  const started = Date.now();
  const model = modelFrom(args);
  const inputEstimate = estimatedInputTokens(args.body);
  const media = args.generator.startsWith("image");
  const billing = args.billingEnabled === false
    ? {
        settleText: async (_usage: MainAppTokenUsage) => undefined,
        settleMedia: async () => undefined,
        release: async () => undefined,
      }
    : await reserveMainAppCredits({
        userId: args.billingUserId,
        operation: args.generator.replace(/[^a-z0-9._-]/gi, "-").toLowerCase(),
        providerId: args.provider,
        model,
        estimatedInputTokens: inputEstimate,
        maxOutputTokens: maxOutputTokensFrom(args.body),
        media,
      });
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const response = await fetch(args.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(args.authHeaders || { Authorization: `Bearer ${args.apiKey}` }),
        },
        body: JSON.stringify(args.body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: T & { error?: { message?: string } | string };
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        throw upstreamError(response, raw);
      }
      const errorMessage = typeof payload.error === "string"
        ? payload.error
        : payload.error?.message;
      if (!response.ok) throw new Error(errorMessage || `HTTP ${response.status}`);

      if (media) {
        await billing.settleMedia();
      } else {
        await billing.settleText(tokenUsage(payload, inputEstimate));
      }
      const exactUsage = tokenUsage(payload, inputEstimate);
      return {
        data: payload,
        usage: {
          provider: args.provider,
          durationMs: Date.now() - started,
          ...(exactUsage.totalTokens ? { tokens: exactUsage.totalTokens } : {}),
          ...(media ? { images: 1 } : {}),
        },
      };
    } catch (error) {
      lastError = error;
      if (error instanceof MainAppBillingError) {
        throw error;
      }
      console.error(
        `[ai:${args.generator}] ${args.provider} attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : "unknown",
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  await billing.release();
  throw lastError instanceof Error ? lastError : new Error("AI 请求失败");
}

export async function fetchAiForm<T>(args: {
  url: string;
  apiKey: string;
  form: FormData;
  timeoutMs: number;
  provider: string;
  generator: string;
  billingUserId?: string;
}): Promise<{ data: T; usage: ServerAiUsage }> {
  const started = Date.now();
  const model = String(args.form.get("model") || "gpt-image-2");
  const billing = await reserveMainAppCredits({
    userId: args.billingUserId,
    operation: args.generator.replace(/[^a-z0-9._-]/gi, "-").toLowerCase(),
    providerId: args.provider,
    model,
    media: true,
  });
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const response = await fetch(args.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${args.apiKey}` },
        body: args.form,
        signal: controller.signal,
      });
      const payload = await response.json() as T & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
      await billing.settleMedia();
      return {
        data: payload,
        usage: {
          provider: args.provider,
          durationMs: Date.now() - started,
          images: 1,
        },
      };
    } catch (error) {
      lastError = error;
      if (error instanceof MainAppBillingError) {
        throw error;
      }
      console.error(
        `[ai:${args.generator}] ${args.provider} multipart attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : "unknown",
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  await billing.release();
  throw lastError instanceof Error ? lastError : new Error("AI 图片编辑请求失败");
}
