# Manual, Progressive Logo Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the first Logo generation only after the user presses the existing button, then append every completed Logo to Step 2 immediately.

**Architecture:** Retain the existing in-memory image job. Its worker writes a partial result whenever one upstream image succeeds; the existing polling client forwards changed partial results to an optional callback. The Logo generator maps each newly available URL to a candidate and the page appends it to the active round. Existing parameter defaults remain unchanged.

**Tech Stack:** React client components, Next route handlers, TypeScript, native Fetch/Response, Node `node:test`.

---

## File structure

- Modify: `lib/image-job-manager.ts` — let a running job publish a partial `ImageJobResult`.
- Modify: `app/api/ai/image/route.ts` — publish one successful upstream image at a time during image batches.
- Modify: `lib/ai-client.ts` — forward changed partial job data to an optional image-call callback.
- Modify: `services/logo-generator.ts` — create one candidate per newly published URL and preserve successful partial output.
- Modify: `components/logo-design-page.tsx` — remove entry-time auto generation and append progressive candidates to the current round.
- Modify: `tests/image-job-manager.test.mjs` — cover visible partial results while a job remains running.
- Modify: `tests/rendered-html.test.mjs` — cover the manual trigger and callback path.

### Task 1: Make partial image-job state observable

**Files:**
- Modify: `tests/image-job-manager.test.mjs`
- Modify: `lib/image-job-manager.ts`

- [ ] **Step 1: Add the partial-result regression test**

```js
test("exposes published image progress before a job completes", async () => {
  let finish;
  const manager = new ImageJobManager();
  const job = manager.enqueue({ prompts: ["first", "second"] }, (publishProgress) => new Promise((resolve) => {
    publishProgress({ data: ["first", undefined], usage });
    finish = resolve;
  }));

  await waitFor(() => manager.get(job.id)?.status, "running");
  assert.deepEqual(manager.get(job.id)?.result?.data, ["first", undefined]);
  finish({ data: ["first", "second"], usage: { ...usage, images: 2 } });
  await waitFor(() => manager.get(job.id)?.status, "completed");
});
```

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/image-job-manager.test.mjs`

Expected: the partial-result test fails until the worker provides `publishProgress` to its job runner. If the current uncommitted implementation makes it pass, retain it and continue with the full verification in Step 4.

- [ ] **Step 3: Pass a publish callback into the worker runner**

```ts
type InternalImageJob<T> = {
  id: string;
  input: T;
  status: ImageJobStatus;
  run: (publishProgress: (result: ImageJobResult) => void) => Promise<ImageJobResult>;
  result?: ImageJobResult;
  error?: string;
  expiresAt?: number;
};

job.result = await job.run((result) => { job.result = result; });
job.status = "completed";
```

Keep the job `running` until its runner resolves. The public `get` result must expose this partial `result` without exposing the input or runner.

- [ ] **Step 4: Verify the manager**

Run: `node --test tests/image-job-manager.test.mjs`

Expected: all manager lifecycle, FIFO, partial-progress, and TTL tests pass.

- [ ] **Step 5: Commit the job-state change**

```bash
git add lib/image-job-manager.ts tests/image-job-manager.test.mjs
git commit -m "feat: publish image job progress"
```

### Task 2: Publish real upstream image completions

**Files:**
- Modify: `app/api/ai/image/route.ts`

- [ ] **Step 1: Add route source-contract coverage**

```js
assert.match(imageRoute, /onImage\?\.\(index\+offset,result\)/);
assert.match(imageRoute, /publishProgress\?\.\(\{data:\[\.\.\.images\]/);
```

Add those assertions to the Logo progressive-generation test in `tests/rendered-html.test.mjs` after it reads `app/api/ai/image/route.ts`.

- [ ] **Step 2: Run the source-contract test**

Run: `node --test tests/rendered-html.test.mjs`

Expected: the Logo progressive-generation assertion fails until the route emits completed individual images.

- [ ] **Step 3: Wire batch completion to the job publisher**

```ts
async function generateInBatches(prompts: string[], provider: "doubao" | "yunwu", referenceImages: (string | undefined)[], referenceImageGroups: string[][], size?: string, quality?: "low" | "medium" | "high", onImage?: (index: number, result: Awaited<ReturnType<typeof generateOne>>) => void) {
  const results: PromiseSettledResult<Awaited<ReturnType<typeof generateOne>>>[] = [];
  for (let index = 0; index < prompts.length; index += 3) {
    results.push(...await Promise.allSettled(prompts.slice(index, index + 3).map(async (prompt, offset) => {
      const result = await generateOne(prompt, provider, referenceImageGroups[index + offset]?.length ? referenceImageGroups[index + offset] : referenceImages[index + offset] ? [referenceImages[index + offset]!] : [], size, quality);
      onImage?.(index + offset, result);
      return result;
    })));
  }
  return results;
}

async function runImageJob(body: NormalizedImageRequest, publishProgress?: (result: ImageJobResult) => void) {
  const images = Array.from({ length: body.prompts.length }) as (string | undefined)[];
  let durationMs = 0;
  const results = await generateInBatches(body.prompts, body.provider, body.referenceImages, body.referenceImageGroups, body.size, body.quality, (index, result) => {
    images[index] = imageUrl(result.data);
    durationMs = Math.max(durationMs, result.usage.durationMs);
    publishProgress?.({ data: [...images], usage: { provider: body.provider, durationMs, images: images.filter(Boolean).length } });
  });
  const completedImages = results.map((result) => result.status === "fulfilled" ? imageUrl(result.value.data) : undefined);
  const succeeded = completedImages.filter(Boolean).length;
  if (succeeded / body.prompts.length <= .5) {
    const reason = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
    const detail = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "服务未返回图片";
    throw new Error(`图像生成成功率 ${Math.round(succeeded / body.prompts.length * 100)}%。原因：${detail}`);
  }
  const completedDurationMs = Math.max(...results.flatMap((result) => result.status === "fulfilled" ? [result.value.usage.durationMs] : [0]));
  return { data: completedImages, usage: { provider: body.provider, durationMs: completedDurationMs, images: succeeded } };
}

const job = imageJobManager.enqueue(body, (publishProgress) => runImageJob(body, publishProgress));
```

Only fulfilled upstream results publish progress. Failed images remain `undefined` and the final success-ratio handling remains the existing route behavior.

- [ ] **Step 4: Verify API and source contracts**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs tests/rendered-html.test.mjs`

Expected: all focused suites pass.

- [ ] **Step 5: Commit the route change**

```bash
git add app/api/ai/image/route.ts tests/rendered-html.test.mjs
git commit -m "feat: stream image job progress"
```

### Task 3: Append progressive Logo candidates only after a user action

**Files:**
- Modify: `lib/ai-client.ts`
- Modify: `services/logo-generator.ts`
- Modify: `components/logo-design-page.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Add the manual-Logo regression contract**

```js
assert.doesNotMatch(page, /useEffect|autoStarted/);
assert.match(page, /onCandidate:/);
assert.match(page, /完成一张即显示一张/);
assert.match(generator, /onCandidate\?\.\(candidate\)/);
assert.match(generator, /onProgress:\(partialUrls\)=>partialUrls\.forEach\(publishCandidate\)/);
assert.match(client, /onProgress\?\.\(payload\.result\.data\)/);
```

- [ ] **Step 2: Run the contract before the implementation**

Run: `node --test tests/rendered-html.test.mjs`

Expected: the new contract fails until the auto-generation effect is removed and the progress callback chain is present. If it already passes from the current uncommitted implementation, use Step 4 to validate it together with the manager tests.

- [ ] **Step 3: Thread progress from polling to the existing manual button**

```ts
async function pollImageJob<T>(jobId: string, onProgress?: (data: T) => void): Promise<AiResponse<T>> {
  let lastProgress = "";
  // After every successful poll:
  if (payload.result) {
    const progress = JSON.stringify(payload.result.data);
    if (progress !== lastProgress) {
      lastProgress = progress;
      onProgress?.(payload.result.data);
    }
  }
}

export async function callAi<T>(generator: AiUsageRecord["generator"], path: "copy" | "image", body: unknown, options?: { onProgress?: (data: T) => void }): Promise<T> {
  let payload: ApiPayload<AiResponse<T>>;
  if (path === "image") {
    payload = await pollImageJob<T>(await startImageJob(requestBody), options?.onProgress);
  } else {
    const response = await fetch(`/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    payload = await readPayload<ApiPayload<AiResponse<T>>>(response);
    if (!response.ok) throw responseError(response, payload.error);
  }
}
```

```ts
const publishCandidate = (imageUrl: string | undefined, index: number) => {
  if (!imageUrl || candidates[index]) return;
  const candidate: LogoCandidate = {
    id: `logo-ai-${generationId}-${index}`,
    imageUrl,
    styleTags: tags.length ? tags : ["品牌识别", "AI生成"],
    logoType: logoTypeForIndex(params, index),
    matchedSellingPoints: matches.length ? [matches[index % matches.length]] : ["品牌识别"],
    ...(params.baseLogoId ? { parentId: params.baseLogoId } : {}),
    round: 1,
  };
  candidates[index] = candidate;
  options.onCandidate?.(candidate);
};

const urls = await callAi<(string | undefined)[]>("logo", "image", { prompts }, {
  onProgress: (partialUrls) => partialUrls.forEach(publishCandidate),
});
urls.forEach(publishCandidate);
```

```tsx
import { useMemo, useState } from "react";

await logoGenerator.generate(params, {
  onCandidate: (candidate) => updateLogoProject((current) =>
    current.candidates.some((item) => item.id === candidate.id)
      ? current
      : { ...current, generationRound: nextRound, candidates: [...current.candidates, { ...candidate, round: nextRound }] },
  ),
});
```

Keep the existing preferences, their defaults, and the existing manual button unchanged. Keep successful partial candidates when the final request later rejects.

- [ ] **Step 4: Verify the complete Logo behavior contract**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs tests/rendered-html.test.mjs`

Expected: all tests pass, including the manual generation and partial-result contracts.

- [ ] **Step 5: Commit the Logo interaction**

```bash
git add lib/ai-client.ts services/logo-generator.ts components/logo-design-page.tsx tests/rendered-html.test.mjs
git commit -m "feat: show logo results progressively"
```

### Task 4: Verify the scoped change set

**Files:**
- Verify: `lib/image-job-manager.ts`
- Verify: `app/api/ai/image/route.ts`
- Verify: `lib/ai-client.ts`
- Verify: `services/logo-generator.ts`
- Verify: `components/logo-design-page.tsx`
- Verify: `tests/image-job-manager.test.mjs`
- Verify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Inspect scope and whitespace**

Run: `git diff --check && git diff --stat -- lib/image-job-manager.ts app/api/ai/image/route.ts lib/ai-client.ts services/logo-generator.ts components/logo-design-page.tsx tests/image-job-manager.test.mjs tests/rendered-html.test.mjs`

Expected: no whitespace errors; no parameter-control or non-Logo page files changed.

- [ ] **Step 2: Run all relevant tests**

Run: `node --test tests/image-job-manager.test.mjs tests/ai-error-handling.test.mjs tests/rendered-html.test.mjs`

Expected: zero failures.

- [ ] **Step 3: Record the local build constraint**

Run: `node ./node_modules/vinext/dist/cli.js build`

Expected: success, or the known local `@rolldown/binding-darwin-arm64` missing-native-dependency failure. Do not reinstall dependencies or modify lockfiles in this task.

- [ ] **Step 4: Commit only the scoped implementation after verification**

```bash
git add lib/image-job-manager.ts app/api/ai/image/route.ts lib/ai-client.ts services/logo-generator.ts components/logo-design-page.tsx tests/image-job-manager.test.mjs tests/rendered-html.test.mjs
git commit -m "test: verify progressive logo generation"
```
