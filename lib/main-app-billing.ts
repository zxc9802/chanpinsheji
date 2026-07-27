import { randomUUID } from "node:crypto";
import { cookies } from "next/headers.js";
import {
  getMainAppSessionCookieName,
  getMainAppUrl,
  readMainAppSessionCookie,
} from "./main-app-sso.ts";

export type MainAppTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type BillingHandle = {
  settleText: (usage: MainAppTokenUsage) => Promise<void>;
  settleMedia: () => Promise<void>;
  release: () => Promise<void>;
};

export class MainAppBillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MainAppBillingError";
  }
}

function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new MainAppBillingError(`${name} is not configured.`);
  return value;
}

export async function currentBillingUserId() {
  const cookieStore = await cookies();
  const session = await readMainAppSessionCookie(
    cookieStore.get(getMainAppSessionCookieName())?.value,
  );
  if (!session) throw new MainAppBillingError("主站登录状态已失效");
  return session.user.id;
}

async function postBilling(userId: string, body: Record<string, unknown>) {
  const response = await fetch(`${getMainAppUrl()}/api/sso/billing`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-qycm-sso-client-secret": requiredValue("MAIN_APP_SSO_CLIENT_SECRET"),
    },
    body: JSON.stringify({
      product: "chanpinsheji",
      userId,
      ...body,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new MainAppBillingError(
      payload.error || `主站积分服务请求失败：${response.status}`,
    );
  }
}

export async function reserveMainAppCredits(input: {
  userId?: string;
  operation: string;
  providerId: string;
  model: string;
  estimatedInputTokens?: number;
  maxOutputTokens?: number;
  media?: boolean;
}): Promise<BillingHandle> {
  const userId = input.userId || await currentBillingUserId();
  const requestId = randomUUID();
  const common = {
    requestId,
    operation: input.operation,
    providerId: input.providerId,
    model: input.model,
    ...(input.media ? {
      mediaProduct: "nanobanana2",
      billableUnits: 1,
    } : {}),
  };
  await postBilling(userId, {
    action: "reserve",
    ...common,
    ...(!input.media ? {
      estimatedInputTokens: input.estimatedInputTokens,
      maxOutputTokens: input.maxOutputTokens,
    } : {}),
  });
  let completed = false;
  return {
    async settleText(usage) {
      if (completed) return;
      await postBilling(userId, { action: "settle", ...common, usage });
      completed = true;
    },
    async settleMedia() {
      if (completed) return;
      await postBilling(userId, { action: "settle", ...common });
      completed = true;
    },
    async release() {
      if (completed) return;
      await postBilling(userId, { action: "release", ...common });
      completed = true;
    },
  };
}
