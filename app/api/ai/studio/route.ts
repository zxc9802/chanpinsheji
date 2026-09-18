import { aiServerConfig } from '@/lib/ai-config';
import { currentBillingUserId } from '@/lib/main-app-billing';
import { ImageJobManager } from '@/lib/image-job-manager';
import { runStudioCreativeTask, validateCreativeRequest } from '@/lib/studio-art-direction';

const runtime = globalThis as typeof globalThis & { __studioJobs?: ImageJobManager<string>; __studioOwners?: Map<string, string> };
const jobs = runtime.__studioJobs ??= new ImageJobManager<string>();
const owners = runtime.__studioOwners ??= new Map<string, string>();
export async function POST(request: Request) {
  let userId: string;
  try { userId = await currentBillingUserId(); }
  catch { return Response.json({ error: '请重新登录' }, { status: 401 }); }
  try {
    const input = validateCreativeRequest(await request.json());
    for (const id of owners.keys()) if (!jobs.get(id)) owners.delete(id);
    const job = jobs.enqueue(userId, async () => {
      const result = await runStudioCreativeTask(input, aiServerConfig.regionVision, userId, job.id);
      return { data: [JSON.stringify(result.data)], usage: { ...result.usage, images: 0 } };
    });
    owners.set(job.id, userId);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '设计任务创建失败' }, { status: 400 }); }
}
export async function GET(request: Request) {
  try {
    const userId = await currentBillingUserId();
    const id = new URL(request.url).searchParams.get('jobId') || '';
    const job = owners.get(id) === userId ? jobs.get(id) : undefined;
    if (!job) return Response.json({ error: '设计任务不存在或已过期' }, { status: 404 });
    return Response.json({ status: job.status, error: job.error, result: job.result?.data[0] ? { data: JSON.parse(job.result.data[0]), usage: job.result.usage } : undefined });
  } catch { return Response.json({ error: '请重新登录' }, { status: 401 }); }
}
