import assert from "node:assert/strict";
import test from "node:test";
import { fetchFalImage } from "../lib/fal-image-client.ts";

const base = "https://queue.fal.run/openai/gpt-image-2.5/requests/test-request";
const queued = { request_id: "test-request", status_url: `${base}/status`, response_url: base };
const image = "https://v3b.fal.media/test-result.png";

async function withProvider(t, respond, run) {
  const oldUrl = process.env.MAIN_APP_URL;
  const oldSecret = process.env.MAIN_APP_SSO_CLIENT_SECRET;
  process.env.MAIN_APP_URL = "https://billing.example";
  process.env.MAIN_APP_SSO_CLIENT_SECRET = "test-billing-secret";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.MAIN_APP_URL; else process.env.MAIN_APP_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.MAIN_APP_SSO_CLIENT_SECRET; else process.env.MAIN_APP_SSO_CLIENT_SECRET = oldSecret;
  });
  const requests = [];
  const billing = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) === "https://billing.example/api/sso/billing") {
      billing.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    }
    requests.push({ url: String(url), ...init });
    return respond(String(url), init, requests);
  });
  await run({ requests, billing, args: { apiKey: "test-fal-secret", prompt: "Packaging design", billingUserId: "test-user", pollIntervalMs: 0 } });
}

for (const references of [[], ["data:image/png;base64,AAAA", "https://images.example/reference.png"]]) {
  test(`fal high ${references.length ? "edit" : "text-to-image"} submits once and settles only after completion`, async t => {
    let polls = 0;
    await withProvider(t, (url, init) => {
      if (init.method === "POST") return Response.json(queued);
      if (url.endsWith("/status")) return Response.json({ status: ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"][polls++] });
      return Response.json({ images: [{ url: image }] });
    }, async ({ args, requests, billing }) => {
      const result = await fetchFalImage({ ...args, referenceImages: references, size: "1024x1536" });
      assert.equal(requests.filter(r => r.method === "POST").length, 1);
      assert.equal(requests[0].url, `https://queue.fal.run/openai/gpt-image-2.5/sunburst/${references.length ? "edit" : "text-to-image"}`);
      assert.deepEqual(JSON.parse(requests[0].body), {
        prompt: args.prompt, quality: "high", num_images: 1, output_format: "png",
        image_size: { width: 1024, height: 1536 }, ...(references.length ? { image_urls: references } : {}),
      });
      assert.ok(requests.every(r => r.headers.Authorization === `Key ${args.apiKey}` && r.redirect === "error"));
      assert.deepEqual(billing.map(r => r.action), ["reserve", "settle"]);
      assert.equal(billing[0].requestId, billing[1].requestId);
      assert.equal(billing[0].providerId, "fal");
      assert.deepEqual(result.data.data, [{ url: image }]);
      assert.equal(result.usage.provider, "fal");
    });
  });
}

for (const [name, response, error] of [
  ["submit failure", () => Response.json({ detail: "invalid request" }, { status: 422 }), /HTTP 422/],
  ["failed task", (_url, init) => Response.json(init.method === "POST" ? queued : { status: "FAILED" }), /FAILED.*test-request/],
  ["empty result", (url, init) => Response.json(init.method === "POST" ? queued : url.endsWith("/status") ? { status: "COMPLETED" } : { images: [] }), /未返回图片.*test-request/],
  ["untrusted task URL", () => Response.json({ ...queued, status_url: "https://untrusted.example/task" }), /无效的任务地址/],
  ["credential in error", (_url, init) => Response.json(init.method === "POST" ? queued : { error: "test-fal-secret denied" }, { status: init.method === "POST" ? 200 : 403 }), /\[redacted\] denied.*test-request/],
]) {
  test(`fal ${name} releases reservation without retrying generation`, async t => {
    await withProvider(t, response, async ({ args, requests, billing }) => {
      await assert.rejects(fetchFalImage(args), error);
      assert.equal(requests.filter(r => r.method === "POST").length, 1);
      assert.ok(requests.every(r => r.url.startsWith("https://queue.fal.run/")));
      assert.deepEqual(billing.map(r => r.action), ["reserve", "release"]);
    });
  });
}

test("fal timeout preserves the request ID and never resubmits", async t => {
  await withProvider(t, (_url, init) => Response.json(init.method === "POST" ? queued : { status: "IN_PROGRESS" }), async ({ args, requests, billing }) => {
    await assert.rejects(fetchFalImage({ ...args, timeoutMs: 25, pollIntervalMs: 5 }), /超时.*test-request/);
    assert.equal(requests.filter(r => r.method === "POST").length, 1);
    assert.deepEqual(billing.map(r => r.action), ["reserve", "release"]);
  });
});

test("fal does not charge or submit when its key is missing", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  await assert.rejects(fetchFalImage({ apiKey: "", prompt: "test" }), /密钥未配置/);
  assert.equal(fetchMock.mock.callCount(), 0);
});
