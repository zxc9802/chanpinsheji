import { aiServerConfig } from '@/lib/ai-config';
import { currentBillingUserId } from '@/lib/main-app-billing';
import { ImageJobManager } from '@/lib/image-job-manager';
import { recognizeRegions, segmentRegion, validateRegionImage } from '@/lib/region-recognition';

const runtime = globalThis as typeof globalThis & { __regionJobs?: ImageJobManager<string>; __regionOwners?: Map<string, string> };
const jobs = runtime.__regionJobs ??= new ImageJobManager<string>();
const owners = runtime.__regionOwners ??= new Map<string, string>();
export async function POST(request: Request) {
  try {
    const userId = await currentBillingUserId();
    const body = await request.json();
    const image = validateRegionImage(body.image);
    if (!['detect', 'segment'].includes(body.action)) return Response.json({ error: '未知区域操作' }, { status: 400 });
    for (const id of owners.keys()) if (!jobs.get(id)) owners.delete(id);
    const job = jobs.enqueue(userId, async () => {
      const started = Date.now();
      const result = body.action === 'detect'
        ? { regions: await recognizeRegions(image, aiServerConfig.yunwu, userId) }
        : { maskUrl: await segmentRegion({ image, region: body.region, width: body.width, height: body.height, apiKey: aiServerConfig.fal.apiKey, userId }) };
      return { data: [JSON.stringify(result)], usage: { provider: body.action === 'detect' ? 'gemini' : 'fal', durationMs: Date.now() - started, images: 0 } };
    });
    owners.set(job.id, userId);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '区域任务创建失败' }, { status: 400 }); }
}
export async function GET(request: Request) {
  try {
    const userId = await currentBillingUserId();
    const id = new URL(request.url).searchParams.get('jobId') || '';
    const job = owners.get(id) === userId ? jobs.get(id) : undefined;
    if (!job) return Response.json({ error: '区域任务不存在或已过期' }, { status: 404 });
    return Response.json({ status: job.status, error: job.error, result: job.result?.data[0] ? JSON.parse(job.result.data[0]) : undefined });
  } catch { return Response.json({ error: '请重新登录' }, { status: 401 }); }
}
