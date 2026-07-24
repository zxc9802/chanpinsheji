# In-memory Image Job Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synchronous image generation with in-memory job IDs and client polling so large Logo jobs do not exceed Cloudflare's request timeout.

**Architecture:** `POST /api/ai/image` will validate and enqueue work, then return HTTP 202 immediately. A process-local manager runs one job at a time, preserving the existing three-image provider batch concurrency. `GET /api/ai/image?jobId=` returns queued, running, completed, or failed state. `callAi` will hide the start/poll protocol from Logo, product, packaging, and marketing callers.

**Tech Stack:** Next route handlers, TypeScript, native Fetch/Response, Node `node:test`.

---

## File structure

- Create: `lib/image-job-manager.ts` — process-local FIFO manager, job state, terminal-result retention, and TTL cleanup.
- Modify: `app/api/ai/image/route.ts` — validate image request, enqueue generation, add job-status `GET`, and retain current provider-generation code as the job executor.
- Modify: `lib/ai-client.ts` — start image jobs and poll them while retaining the current `callAi` return type.
- Create: `tests/image-job-manager.test.mjs` — executable state-transition and expiration coverage for the manager.
- Modify: `tests/ai-error-handling.test.mjs` — source-level regression contract for image start/poll behavior in the client and route.

### Task 1: Add a testable in-memory image-job manager

**Files:**
- Create: `lib/image-job-manager.ts`
- Create: `tests/image-job-manager.test.mjs`

- [ ] **Step 1: Write the failing job-lifecycle tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { ImageJobManager } from "../lib/image-job-manager.ts";

test("queues a job, completes it, and retains its result", async () => {
  let finish;
  const manager = new ImageJobManager({ ttlMs: 15_000 });
  const job = manager.enqueue({ prompts: ["logo"] }, () => new Promise((resolve) => { finish = resolve; }));
  assert.equal(manager.get(job.id)?.status, "queued");
  await Promise.resolve();
  assert.equal(manager.get(job.id)?.status, "running");
  finish({ data: ["https://image.example/logo.jpg"], usage: { provider: "yunwu", durationMs: 1, images: 1 } });
  await Promise.resolve();
  assert.equal(manager.get(job.id)?.status, "completed");
  assert.deepEqual(manager.get(job.id)?.result?.data, ["https://image.example/logo.jpg"]);
});

test("records a failed job and removes terminal jobs after their TTL", async () => {
  let now = 1_000;
  const manager = new ImageJobManager({ ttlMs: 100, now: () => now });
  const job = manager.enqueue({ prompts: ["logo"] }, async () => { throw new Error("provider unavailable"); });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(manager.get(job.id)?.status, "failed");
  assert.match(manager.get(job.id)?.error || "", /provider unavailable/);
  now += 101;
  manager.cleanup();
  assert.equal(manager.get(job.id), undefined);
});
```

- [ ] **Step 2: Run the test to verify the expected missing-module failure**

Run: `node --test tests/image-job-manager.test.mjs`

Expected: FAIL because `lib/image-job-manager.ts` does not exist.

- [ ] **Step 3: Implement the manager with a single FIFO worker**

```ts
export type ImageJobStatus = "queued" | "running" | "completed" | "failed";
export type ImageJobResult = { data: (string | undefined)[]; usage: { provider: string; durationMs: number; images: number } };
type Job<T> = { id: string; input: T; status: ImageJobStatus; run: () => Promise<ImageJobResult>; result?: ImageJobResult; error?: string; expiresAt?: number };

export class ImageJobManager<T = unknown> {
  private jobs = new Map<string, Job<T>>();
  private running = false;
  constructor(private options: { ttlMs?: number; now?: () => number } = {}) {}
  enqueue(input: T, run: () => Promise<ImageJobResult>) { /* create queued job, queueMicrotask drain, return public job */ }
  get(id: string) { /* cleanup and return public job without input/run */ }
  cleanup() { /* remove completed or failed jobs whose expiresAt is in the past */ }
  private async drain() { /* run the earliest queued job, record completed/failed, set terminal expiresAt, then continue */ }
}
```

Use `queueMicrotask` before `drain()` so a newly created job is observable as `queued`. The manager must never throw from the detached worker; it records the failure on the job.

- [ ] **Step 4: Run the manager tests**

Run: `node --test tests/image-job-manager.test.mjs`

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit the manager**

```bash
git add lib/image-job-manager.ts tests/image-job-manager.test.mjs
git commit -m "feat: add in-memory image jobs"
```

### Task 2: Make the image route start and expose jobs

**Files:**
- Modify: `app/api/ai/image/route.ts`
- Modify: `tests/ai-error-handling.test.mjs`

- [ ] **Step 1: Add failing API-contract assertions**

```js
test("image route starts work asynchronously and exposes poll status", async () => {
  const route = await readFile(new URL("../app/api/ai/image/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /status:202/);
  assert.match(route, /jobId/);
  assert.match(route, /imageJobManager\.enqueue/);
});
```

- [ ] **Step 2: Run the assertion before changing the route**

Run: `node --test tests/ai-error-handling.test.mjs`

Expected: FAIL because the route has no `GET`, job ID, or HTTP 202 response.

- [ ] **Step 3: Refactor the current generation body into `runImageJob` and add route handlers**

```ts
function normalizeImageRequest(body: ImageRequest): NormalizedImageRequest {
  // Keep the current provider/config validation, prompt normalization,
  // reference-image validation, size/quality validation, and error messages.
  // Return only a validated request that is safe to queue.
}

async function runImageJob(body: NormalizedImageRequest): Promise<ImageJobResult> {
  // Move generateInBatches, success threshold, and usage calculation here.
  // Return { data: images, usage } or throw the existing human-readable error.
}

export async function POST(request: Request) {
  try {
    const body = normalizeImageRequest(await request.json() as ImageRequest);
    const job = imageJobManager.enqueue(body, () => runImageJob(body));
    return Response.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图像任务创建失败" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "缺少图像任务 ID" }, { status: 400 });
  const job = imageJobManager.get(jobId);
  if (!job) return Response.json({ error: "图像任务不存在或已过期，请重新生成" }, { status: 404 });
  return Response.json(job);
}
```

Validate configuration and prompts before `enqueue`, not inside the detached worker, so invalid requests still return immediate 4xx JSON. Keep `ImageJobManager` as a generic class in `lib/image-job-manager.ts`; instantiate its `globalThis` singleton in the route using the route-local `NormalizedImageRequest` type. This avoids duplicate queues during hot reload while deliberately remaining process-local and avoids a route-to-library circular type dependency.

- [ ] **Step 4: Run the route-contract and manager tests**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs`

Expected: PASS with all tests green.

- [ ] **Step 5: Commit the asynchronous route**

```bash
git add app/api/ai/image/route.ts tests/ai-error-handling.test.mjs
git commit -m "feat: expose image generation jobs"
```

### Task 3: Poll image jobs behind the existing client API

**Files:**
- Modify: `lib/ai-client.ts`
- Modify: `tests/ai-error-handling.test.mjs`

- [ ] **Step 1: Add failing client-contract assertions**

```js
test("image client starts and polls jobs while preserving callAi results", async () => {
  const client = await readFile(new URL("../lib/ai-client.ts", import.meta.url), "utf8");
  assert.match(client, /startImageJob/);
  assert.match(client, /pollImageJob/);
  assert.match(client, /1500/);
  assert.match(client, /10 \* 60 \* 1000/);
  assert.match(client, /path === "image"/);
});
```

- [ ] **Step 2: Run the client-contract test before implementation**

Run: `node --test tests/ai-error-handling.test.mjs`

Expected: FAIL because image calls still await one synchronous POST response.

- [ ] **Step 3: Add image-specific start/poll helpers and branch `callAi`**

```ts
const IMAGE_JOB_POLL_MS = 1500;
const IMAGE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

async function startImageJob(body: unknown) { /* POST /api/ai/image; require a jobId from HTTP 202 JSON */ }
async function pollImageJob<T>(jobId: string): Promise<T> {
  const deadline = Date.now() + IMAGE_JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, IMAGE_JOB_POLL_MS));
    // GET /api/ai/image?jobId=..., return data for completed,
    // throw error for failed/404, otherwise continue.
  }
  throw new Error("图像任务等待超时，请稍后重试");
}

export async function callAi<T>(generator: AiUsageRecord["generator"], path: "copy" | "image", body: unknown): Promise<T> {
  // Preserve usage recording and copy behavior. When path is image,
  // call startImageJob then pollImageJob<T> before recording success.
}
```

Reuse the existing safe text-first JSON parsing and error formatting for both the start and poll responses. Do not change image-generator caller signatures.

- [ ] **Step 4: Run focused and existing tests**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs tests/rendered-html.test.mjs`

Expected: PASS with all tests green.

- [ ] **Step 5: Commit client polling**

```bash
git add lib/ai-client.ts tests/ai-error-handling.test.mjs
git commit -m "feat: poll image generation jobs"
```

### Task 4: Verify the full change set

**Files:**
- Verify: `lib/image-job-manager.ts`
- Verify: `app/api/ai/image/route.ts`
- Verify: `lib/ai-client.ts`
- Verify: `tests/image-job-manager.test.mjs`
- Verify: `tests/ai-error-handling.test.mjs`

- [ ] **Step 1: Inspect the final diff and whitespace**

Run: `git diff origin/main...HEAD --check && git diff origin/main...HEAD --stat`

Expected: no whitespace errors; only the job manager, image route, AI client, and their tests plus the approved docs change.

- [ ] **Step 2: Run all repository tests**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs tests/rendered-html.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 3: Attempt the production build**

Run: `node ./node_modules/vinext/dist/cli.js build`

Expected: a successful build, or the already-observed local `@rolldown/binding-darwin-arm64` missing-native-dependency blocker. Do not change lockfiles or reinstall dependencies as part of this feature.

- [ ] **Step 4: Commit final verification adjustments if needed**

```bash
git add lib/image-job-manager.ts app/api/ai/image/route.ts lib/ai-client.ts tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs
git commit -m "test: verify image job polling"
```
