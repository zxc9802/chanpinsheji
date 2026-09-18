import type { StudioCreativeRequest } from '../lib/studio-art-direction';
import type { DesignPlan, DesignReview } from '../types/studio';
import { recordAiUsage } from '../lib/ai-usage';

export async function studioCreativeTask<T extends DesignPlan | DesignReview>(body: StudioCreativeRequest, pendingId: string | undefined, onPending: (jobId: string) => void): Promise<T> {
  let jobId = pendingId;
  if (!jobId) {
    const response = await fetch('/api/ai/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const start = await response.json();
    if (!response.ok || !start.jobId) throw new Error(start.error || '设计任务创建失败');
    jobId = start.jobId as string;
    onPending(jobId);
  }
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/ai/studio?jobId=${encodeURIComponent(jobId)}`);
    const job = await response.json();
    if (!response.ok || job.status === 'failed') throw new Error(job.error || '设计任务失败');
    if (job.status === 'completed') {
      if (!job.result?.data) throw new Error('设计任务未返回结果');
      recordAiUsage({ generator: body.action === 'plan' ? 'structure' : body.kind, provider: 'gemini', durationMs: 0, ...job.result.usage, success: true });
      return job.result.data as T;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('设计任务等待超时，请稍后继续');
}
