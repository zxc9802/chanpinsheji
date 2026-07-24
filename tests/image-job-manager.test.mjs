import assert from "node:assert/strict";
import test from "node:test";
import { ImageJobManager } from "../lib/image-job-manager.ts";

const usage = { provider: "yunwu", durationMs: 1, images: 1 };

async function waitFor(read, expected) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (read() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(read(), expected);
}

test("queues a job, completes it, and retains its result", async () => {
  let finish;
  const manager = new ImageJobManager({ ttlMs: 15_000 });
  const job = manager.enqueue(
    { prompts: ["logo"] },
    () => new Promise((resolve) => { finish = resolve; }),
  );

  assert.equal(manager.get(job.id)?.status, "queued");
  await waitFor(() => manager.get(job.id)?.status, "running");
  finish({ data: ["https://image.example/logo.jpg"], usage });
  await waitFor(() => manager.get(job.id)?.status, "completed");
  assert.deepEqual(manager.get(job.id)?.result?.data, ["https://image.example/logo.jpg"]);
});

test("runs queued jobs one at a time in FIFO order", async () => {
  const order = [];
  const manager = new ImageJobManager();
  const first = manager.enqueue({ prompts: ["first"] }, async () => {
    order.push("first");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: ["first"], usage };
  });
  const second = manager.enqueue({ prompts: ["second"] }, async () => {
    order.push("second");
    return { data: ["second"], usage };
  });

  await waitFor(() => manager.get(second.id)?.status, "completed");
  assert.equal(manager.get(first.id)?.status, "completed");
  assert.deepEqual(order, ["first", "second"]);
});

test("records a failed job and removes terminal jobs after their TTL", async () => {
  let now = 1_000;
  const manager = new ImageJobManager({ ttlMs: 100, now: () => now });
  const job = manager.enqueue({ prompts: ["logo"] }, async () => { throw new Error("provider unavailable"); });

  await waitFor(() => manager.get(job.id)?.status, "failed");
  assert.match(manager.get(job.id)?.error || "", /provider unavailable/);
  now += 101;
  manager.cleanup();
  assert.equal(manager.get(job.id), undefined);
});
