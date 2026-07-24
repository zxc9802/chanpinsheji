import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchAiJson } from "../lib/server-ai-client.ts";

const htmlError = "<!DOCTYPE html><html><body>upstream unavailable</body></html>";

test("server AI client reports an upstream HTML response without a JSON parser error", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = async () => new Response(htmlError, { status: 502, headers: { "content-type": "text/html" } });
  console.error = () => {};
  try {
    await assert.rejects(
      () => fetchAiJson({ url: "https://model.example/v1/chat/completions", apiKey: "test", body: {}, timeoutMs: 1, provider: "openai", generator: "copy" }),
      /AI 上游返回 HTTP 502.*upstream unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("browser AI client reads text before parsing an API response", async () => {
  const client = await readFile(new URL("../lib/ai-client.ts", import.meta.url), "utf8");
  assert.match(client, /const raw = await response\.text\(\)/);
  assert.doesNotMatch(client, /const payload = await response\.json\(\)/);
});

test("document import exposes an upstream dependency failure without a gateway 502", async () => {
  const route = await readFile(new URL("../app/api/ai/copy/route.ts", import.meta.url), "utf8");
  assert.match(route, /AI 上游调用失败.*status:424/);
});

test("image route starts work asynchronously and exposes poll status", async () => {
  const route = await readFile(new URL("../app/api/ai/image/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /status:\s*202/);
  assert.match(route, /jobId/);
  assert.match(route, /imageJobManager\.enqueue/);
});
