export type ImageJobStatus = "queued" | "running" | "completed" | "failed";

export type ImageJobResult = {
  data: (string | undefined)[];
  usage: { provider: string; durationMs: number; images: number };
};

type InternalImageJob<T> = {
  id: string;
  input: T;
  status: ImageJobStatus;
  run: (publishProgress: (result: ImageJobResult) => void) => Promise<ImageJobResult>;
  result?: ImageJobResult;
  error?: string;
  expiresAt?: number;
};

export type ImageJob = Omit<InternalImageJob<unknown>, "input" | "run">;

type ImageJobManagerOptions = {
  ttlMs?: number;
  now?: () => number;
};

export class ImageJobManager<T = unknown> {
  private readonly jobs = new Map<string, InternalImageJob<T>>();
  private running = false;
  private readonly options: ImageJobManagerOptions;

  constructor(options: ImageJobManagerOptions = {}) {
    this.options = options;
  }

  enqueue(input: T, run: (publishProgress: (result: ImageJobResult) => void) => Promise<ImageJobResult>): ImageJob {
    const job: InternalImageJob<T> = {
      id: crypto.randomUUID(),
      input,
      status: "queued",
      run,
    };
    this.jobs.set(job.id, job);
    queueMicrotask(() => { void this.drain(); });
    return this.publicJob(job);
  }

  get(id: string): ImageJob | undefined {
    this.cleanup();
    const job = this.jobs.get(id);
    return job ? this.publicJob(job) : undefined;
  }

  cleanup() {
    const now = this.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt !== undefined && job.expiresAt <= now) this.jobs.delete(id);
    }
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private publicJob(job: InternalImageJob<T>): ImageJob {
    const { input: _input, run: _run, ...publicJob } = job;
    return publicJob;
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const job = [...this.jobs.values()].find((candidate) => candidate.status === "queued");
        if (!job) return;

        job.status = "running";
        try {
          job.result = await job.run((result) => { job.result = result; });
          job.status = "completed";
        } catch (error) {
          job.error = error instanceof Error ? error.message : typeof error === "string" ? error : "图像生成失败";
          job.status = "failed";
        }
        job.expiresAt = this.now() + (this.options.ttlMs ?? 15 * 60 * 1000);
      }
    } finally {
      this.running = false;
      if ([...this.jobs.values()].some((job) => job.status === "queued")) queueMicrotask(() => { void this.drain(); });
    }
  }
}
